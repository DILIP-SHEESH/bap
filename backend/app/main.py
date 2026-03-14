import os
import math
import re
import uuid
import json
import asyncio
import numpy as np
import pandas as pd
import requests
from io import StringIO
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
from app.database import supabase

app = FastAPI(title="InsightAR Civic Intelligence Engine")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MODELS ───────────────────────────────────────────────────────────────────
class SearchQuery(BaseModel):
    query: str

class AIAnalyzePayload(BaseModel):
    title: str = "Unknown Dataset"
    stats: dict = {}
    flags: list = []

class NLQueryPayload(BaseModel):
    question: str
    dataset_id: str

class CorrelationPayload(BaseModel):
    dataset_id_a: str
    dataset_id_b: str
    query: Optional[str] = None  # Dynamic user search for correlation

class ReportPayload(BaseModel):
    dataset_title: str
    stats: dict = {}
    flags: list = []
    ai_analysis: str = ""
    chart_data: list = []
    nl_queries: list = []


# ─── HELPERS ──────────────────────────────────────────────────────────────────
def sanitize_float(val):
    try:
        f = float(val)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return 0.0

def numpy_to_python(obj):
    if obj is None: return None
    if isinstance(obj, (np.integer,)): return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return 0.0 if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, np.bool_): return bool(obj)
    if isinstance(obj, np.ndarray): return [numpy_to_python(i) for i in obj.tolist()]
    if isinstance(obj, float): return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict): return {str(k): numpy_to_python(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [numpy_to_python(i) for i in obj]
    try:
        if pd.isna(obj): return None
    except (TypeError, ValueError):
        pass
    return obj

def try_parse_csv(content_str: str) -> pd.DataFrame:
    strategies = [
        {},
        {"on_bad_lines": "skip"},
        {"sep": None, "engine": "python", "on_bad_lines": "skip"},
        {"sep": None, "engine": "python"},
        {"header": 1, "on_bad_lines": "skip"},
        {"skiprows": 1, "on_bad_lines": "skip"},
        {"encoding": "utf-8-sig", "on_bad_lines": "skip"},
        {"sep": "\t", "on_bad_lines": "skip"},
    ]
    last_err = None
    for kwargs in strategies:
        try:
            df = pd.read_csv(StringIO(content_str), **kwargs)
            if len(df.columns) >= 1 and len(df) > 0:
                return df
        except Exception as e:
            last_err = e
            continue
    raise ValueError(f"Could not parse CSV. Last error: {last_err}")

def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df = df.reset_index(drop=True)
    
    if any(str(c).startswith("col_") or "Unnamed" in str(c) for c in df.columns):
        for idx, row in df.head(5).iterrows():
            valid = [str(x) for x in row if pd.notna(x) and len(str(x).strip()) > 2]
            if len(valid) >= len(df.columns) * 0.4:
                df.columns = [str(x).strip() if pd.notna(x) else f"Feature_{i}" for i, x in enumerate(row)]
                df = df.iloc[idx+1:].reset_index(drop=True)
                break

    df.columns = [re.sub(r'[^\x00-\x7F]+', '', str(c)).strip() or f"Column_{i}" for i, c in enumerate(df.columns)]
    
    for col in df.columns:
        if df[col].astype(str).str.match(r'^[\s\-]*$').all():
            df.drop(columns=[col], inplace=True)
            continue
            
        if df[col].dtype == "object":
            ext = df[col].astype(str).str.extract(r'([-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+|\d+)', expand=False)
            coerced = pd.to_numeric(ext.str.replace(',', ''), errors="coerce")
            if coerced.notna().sum() > 0 and (coerced.notna().sum() / len(df)) >= 0.1:
                df[col] = coerced
            else:
                def clean_text(val):
                    val_str = str(val).strip()
                    if pd.isna(val) or val_str in ('-', 'nan', 'None', ''): return None
                    weird = len(re.findall(r'[^\x00-\x7F]', val_str))
                    if weird > 0 and len(val_str) > 0 and (weird / len(val_str)) > 0.3:
                        return "[Regional/Unstructured Data]"
                    return val_str
                df[col] = df[col].apply(clean_text)
    return df

def parse_pdf_to_df(content: bytes) -> pd.DataFrame:
    try:
        import pdfplumber
        import io as _io
    except ImportError:
        raise HTTPException(status_code=422, detail="pdfplumber not installed")

    with pdfplumber.open(_io.BytesIO(content)) as pdf:
        all_rows = []
        for page in pdf.pages:
            t = page.extract_table()
            if t: all_rows.extend(t)

    if not all_rows: raise ValueError("No tables found in PDF")

    from collections import Counter
    lengths = [len(r) for r in all_rows if r]
    if not lengths: raise ValueError("PDF tables are empty")

    canonical_len = Counter(lengths).most_common(1)[0][0]
    normalised = []
    for row in all_rows:
        if row is None: continue
        row = list(row)
        if len(row) < canonical_len: row += [None] * (canonical_len - len(row))
        elif len(row) > canonical_len: row = row[:canonical_len]
        normalised.append(row)

    if not normalised: raise ValueError("No valid rows after normalisation")

    header = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(normalised[0])]
    df = pd.DataFrame(normalised[1:], columns=header)
    return df

def fetch_and_clean_df(dataset_id: str):
    response = supabase.table("data_catalog").select("*").eq("id", dataset_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Dataset not found")

    meta = response.data[0]
    source_url = meta.get("direct_csv_link") or meta.get("source_url")
    if not source_url:
        raise HTTPException(status_code=400, detail="No data URL for this dataset")

    url_lower = source_url.lower().split("?")[0]
    req = requests.get(source_url, timeout=20)
    req.raise_for_status()

    try:
        if url_lower.endswith(".xlsx") or url_lower.endswith(".xls"):
            try: df = pd.read_excel(req.content, engine="openpyxl")
            except: df = pd.read_excel(req.content, engine="xlrd")
        elif url_lower.endswith(".pdf"):
            df = parse_pdf_to_df(req.content)
        else:
            parsed = False
            for encoding in ["utf-8", "latin-1", "utf-8-sig"]:
                try:
                    df = try_parse_csv(req.content.decode(encoding))
                    parsed = True
                    break
                except: continue
            if not parsed:
                df = try_parse_csv(req.content.decode("utf-8", errors="replace"))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Data parse failed: {e}")

    df = clean_dataframe(df)

    try:
        supabase.table("data_catalog").update(
            {"column_headers": df.columns.tolist()}
        ).eq("id", dataset_id).execute()
    except Exception:
        pass

    return df, meta


# 🚨 THE MASTER ANALYTICS FIX (NO MORE "COMPLAINT IDs" ON GRAPHS) 🚨
def run_analytics(df: pd.DataFrame):
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    
    # Use strict Regex word boundaries (\b) to permanently ignore Fake Numbers
    skip_regex = re.compile(r'\b(id|sl|no|sr|sno|pin|code|year|phone|mobile|lat|lng|latitude|longitude|index)\b', re.IGNORECASE)
    useful = [c for c in numeric_cols if not skip_regex.search(str(c))]
    
    # If it killed everything (extremely rare), fallback but STILL ignore exact IDs
    if not useful and numeric_cols: 
        salvage_regex = re.compile(r'\b(id|phone|mobile)\b', re.IGNORECASE)
        useful = [c for c in numeric_cols if not salvage_regex.search(str(c))]

    insights = {
        "analyzed_field": "N/A", "total_sum": 0.0, "average": 0.0,
        "max_value": 0.0, "min_value": 0.0, "std_dev": 0.0, "data_points": int(len(df)),
    }
    flags = []

    if not useful: return insights, flags

    best_col = None
    best_variance = -1
    for col in useful:
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(series) >= 3:
            v = float(series.var())
            if v > best_variance:
                best_variance = v
                best_col = col

    target_col = best_col if best_col else useful[-1]
    clean_series = pd.to_numeric(df[target_col], errors="coerce").dropna()

    if clean_series.empty: return insights, flags

    avg = float(clean_series.mean())
    std_dev = float(clean_series.std()) if len(clean_series) > 1 else 0.0

    insights.update({
        "analyzed_field": str(target_col),
        "total_sum": sanitize_float(clean_series.sum()),
        "average": sanitize_float(avg),
        "max_value": sanitize_float(clean_series.max()),
        "min_value": sanitize_float(clean_series.min()),
        "std_dev": sanitize_float(std_dev),
        "data_points": int(len(df)),
    })

    MIN_POINTS = 5
    if std_dev > 0 and len(clean_series) >= MIN_POINTS and avg > 0:
        threshold = avg + (2.0 * std_dev) # 2 Sigma for tighter anomaly detection
        anomaly_mask = pd.to_numeric(df[target_col], errors="coerce") > threshold
        anomalies = df[anomaly_mask].copy()

        entity_cols = ["Ward Name", "Location", "District", "State", "City", "Name", "Taluk", "Village", "Zone", "Area"]

        for index, row in anomalies.head(4).iterrows():
            entity = next(
                (str(row[c]) for c in entity_cols if c in df.columns and pd.notna(row.get(c)) and str(row.get(c)).strip() not in ("", "nan", "None")),
                f"Row {index + 1}",
            )
            val = pd.to_numeric(row[target_col], errors="coerce")
            if pd.isna(val): continue
            val_f = float(val)
            multiplier = round(val_f / avg, 1) if avg != 0 else 0
            deviation = round((val_f - avg) / std_dev, 2) if std_dev else 0

            flags.append({
                "type": "Statistical Outlier",
                "entity": str(entity),
                "value": sanitize_float(val_f),
                "message": f"'{entity}' recorded {val_f:,.1f} (avg: {avg:,.0f}). {deviation}σ deviation.",
                "deviation_score": deviation,
            })

    return insights, flags

def df_to_safe_records(df: pd.DataFrame, limit: int = 50) -> list:
    df_slice = df.head(limit).copy()
    df_slice = df_slice.replace({pd.NA: None, float("nan"): None, float("inf"): None, float("-inf"): None})
    return numpy_to_python(df_slice.to_dict(orient="records"))


# ─── DYNAMIC API AGGREGATOR ───────────────────────────────────────────────────
def fetch_open_gov_data(keyword: str, limit: int = 10) -> list:
    datasets = []
    apis = [
        f"https://data.gov.in/api/3/action/package_search?q={keyword}&rows={limit*3}",
        f"https://catalog.data.gov/api/3/action/package_search?q={keyword}&rows={limit*3}"
    ]
    headers = {"User-Agent": "CivicIntelligence/1.0 (Hackathon Prototype)"}

    for api_url in apis:
        if len(datasets) >= limit: break
        try:
            resp = requests.get(api_url, headers=headers, timeout=12)
            if resp.status_code != 200: continue
            
            results = resp.json().get("result", {}).get("results", [])
            for pkg in results:
                csv_res = next((r for r in pkg.get("resources", []) if str(r.get("format", "")).lower() in ["csv", "comma separated values"]), None)
                
                if csv_res and csv_res.get("url"):
                    tags = [t.get("name", "").lower() for t in pkg.get("tags", []) if t.get("name")]
                    if not tags: tags = [keyword, "government", "open-data"]
                    
                    datasets.append({
                        "title": pkg.get("title", f"Civic Dataset: {keyword}").strip(),
                        "description": str(pkg.get("notes", "No description provided."))[:400].strip(),
                        "source_url": pkg.get("url") or csv_res.get("url"),
                        "direct_csv_link": csv_res.get("url"),
                        "tags": tags[:6],
                        "column_headers": []
                    })
                    if len(datasets) >= limit: break
        except Exception as e:
            continue
    return datasets


# ─── ENDPOINT 1: JIT FETCH ────────────────────────────────────────────────────
@app.get("/api/jit-fetch/{dataset_id}")
async def jit_fetch_dataset(dataset_id: str, preview_limit: int = 50):
    try:
        df, meta = fetch_and_clean_df(dataset_id)
        insights, flags = run_analytics(df)
        return {
            "status": "success",
            "metadata": meta,
            "audit": {
                "viz_mode": "bar",
                "primary_metric": insights["analyzed_field"],
                "summary": f"Analyzed {len(df)} records.",
                "stats": numpy_to_python(insights),
                "flags": numpy_to_python(flags),
            },
            "data": df_to_safe_records(df, preview_limit),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── ENDPOINT 2: STREAMING JIT (WITH REGION SLICER) ───────────────────────────
@app.get("/api/jit-stream/{dataset_id}")
async def jit_stream(dataset_id: str, region: Optional[str] = None):
    async def event_stream():
        def send(msg: str, pct: int) -> str:
            return f"data: {json.dumps({'message': msg, 'progress': pct})}\n\n"
        try:
            yield send("Connecting to Supabase catalog...", 5)
            await asyncio.sleep(0.05)

            resp = supabase.table("data_catalog").select("*").eq("id", dataset_id).execute()
            if not resp.data:
                yield f"data: {json.dumps({'error': 'Dataset not found in catalog'})}\n\n"
                return

            meta = resp.data[0]
            source_url = meta.get("direct_csv_link") or meta.get("source_url")
            if not source_url:
                yield f"data: {json.dumps({'error': 'No data URL for this dataset'})}\n\n"
                return

            yield send("Connecting to government data portal...", 12)
            await asyncio.sleep(0.05)

            url_lower = source_url.lower().split("?")[0]
            file_type = ("xlsx" if (url_lower.endswith(".xlsx") or url_lower.endswith(".xls")) else "pdf" if url_lower.endswith(".pdf") else "csv")

            try:
                req = requests.get(source_url, timeout=25)
                req.raise_for_status()
            except Exception as e:
                yield f"data: {json.dumps({'error': f'Failed to download data: {str(e)}'})}\n\n"
                return

            size_kb = len(req.content) // 1024
            yield send(f"Downloaded {size_kb} KB of {file_type.upper()} data", 28)
            await asyncio.sleep(0.05)

            try:
                if file_type == "xlsx":
                    try: df = pd.read_excel(req.content, engine="openpyxl")
                    except: df = pd.read_excel(req.content, engine="xlrd")
                elif file_type == "pdf":
                    df = parse_pdf_to_df(req.content)
                else:
                    parsed = False
                    for encoding in ["utf-8", "latin-1", "utf-8-sig"]:
                        try:
                            text = req.content.decode(encoding)
                            df = try_parse_csv(text)
                            parsed = True
                            break
                        except: continue
                    if not parsed:
                        yield f"data: {json.dumps({'error': 'Could not parse CSV data'})}\n\n"
                        return
            except Exception as e:
                yield f"data: {json.dumps({'error': f'File parsing failed: {str(e)}'})}\n\n"
                return

            yield send(f"Parsed {len(df):,} rows × {len(df.columns)} columns", 48)
            await asyncio.sleep(0.05)

            df = clean_dataframe(df)

            if region and region.strip():
                yield send(f"Surgically extracting data for region: {region.upper()}...", 60)
                await asyncio.sleep(0.05)
                text_cols = [c for c in df.columns if df[c].dtype == "object"]
                mask = pd.Series(False, index=df.index)
                for c in text_cols:
                    mask |= df[c].astype(str).str.contains(region, case=False, na=False)
                
                df = df[mask].reset_index(drop=True)
                if df.empty:
                    yield f"data: {json.dumps({'error': f'No data found for region: {region}'})}\n\n"
                    return
                meta['title'] = f"{meta['title']} (Filtered: {region.upper()})"

            numeric_count = len(df.select_dtypes(include=["number"]).columns)
            yield send(f"Cleaned {numeric_count} numeric columns", 64)
            await asyncio.sleep(0.05)

            try:
                supabase.table("data_catalog").update({"column_headers": df.columns.tolist()}).eq("id", dataset_id).execute()
            except: pass

            yield send("Running statistical analysis + anomaly detection...", 80)
            await asyncio.sleep(0.05)

            insights, flags = run_analytics(df)

            yield send(f"Detected {len(flags)} anomalies across {len(df):,} records", 94)
            await asyncio.sleep(0.05)

            final_payload = {
                "status": "success",
                "metadata": meta,
                "audit": {
                    "viz_mode": "bar",
                    "primary_metric": insights["analyzed_field"],
                    "summary": f"Analyzed {len(df)} records.",
                    "stats": numpy_to_python(insights),
                    "flags": numpy_to_python(flags),
                },
                "data": df_to_safe_records(df, 50),
            }

            yield send("Analysis complete", 100)
            await asyncio.sleep(0.05)
            yield f"data: {json.dumps({'done': True, 'payload': final_payload})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── ENDPOINT 3: AI ANALYSIS ──────────────────────────────────────────────────
@app.post("/api/ai-analyze")
async def ai_analyze(payload: AIAnalyzePayload):
    try:
        stats = payload.stats
        flags = payload.flags
        anomaly_text = ("Anomalies detected:\n" + "\n".join(f"- {f['entity']}: {f['message']}" for f in flags[:3]) if flags else "No statistical anomalies detected.")
        prompt = f"""You are a senior civic data analyst reviewing Indian government data for policymakers and citizens.

Dataset: {payload.title}
Records: {stats.get('data_points', 0)}
Primary metric: {stats.get('analyzed_field', 'unknown')}
Average: {stats.get('average', 0):.2f}
Maximum: {stats.get('max_value', 0):.2f}
Minimum: {stats.get('min_value', 0):.2f}
Std deviation: {stats.get('std_dev', 0):.2f}
Total sum: {stats.get('total_sum', 0):.2f}
{anomaly_text}

Write a 3-4 sentence analysis. Cite actual numbers. Explain what this means for citizens. If anomalies exist, name which entities need investigation. No bullet points. Direct and professional."""

        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=250,
            temperature=0.4,
        )
        return {"status": "success", "analysis": completion.choices[0].message.content.strip()}

    except Exception as e:
        stats = payload.stats
        fc = len(payload.flags)
        fallback = f"Analysis of '{payload.title}': {stats.get('data_points', 0)} records processed. Average {stats.get('analyzed_field', 'metric')} is {stats.get('average', 0):,.2f}. {'Flagged ' + str(fc) + ' outlier(s) requiring review.' if fc else 'Data distribution appears normal.'}"
        return {"status": "fallback", "analysis": fallback}


# ─── ENDPOINT 4: NL QUERY ─────────────────────────────────────────────────────
@app.post("/api/nl-query")
async def natural_language_query(payload: NLQueryPayload):
    df = None
    try:
        df, meta = fetch_and_clean_df(payload.dataset_id)
        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
        if len(df) < 2 or (len(numeric_cols) == 0 and len(df.columns) < 2):
            return {"status": "error", "message": "Insufficient data in this dataset to answer questions.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": ""}

        columns_info = {col: str(df[col].dtype) for col in df.columns}
        sample_rows = numpy_to_python(df.head(3).replace({pd.NA: None, float("nan"): None, float("inf"): None}).to_dict(orient="records"))

        prompt = f"""You are a Python/pandas expert. Given a dataframe `df`, write ONE pandas expression to answer the user's question.

DataFrame columns and dtypes: {json.dumps(columns_info)}
Sample rows: {json.dumps(sample_rows, default=str)}

User question: "{payload.question}"

Rules:
- Return ONLY the pandas expression. No explanation, no markdown, no backticks.
- Must evaluate to a scalar value, Series, or small DataFrame.
- Use .head(10) if returning rows.
- Prefer .to_dict(orient='records') for DataFrames or .to_dict() for Series.
- Wrap scalar numeric results in float() or int() to avoid numpy types.
- Only use column names that actually exist in the DataFrame above.
- If the question cannot be answered with available columns, return exactly: None"""

        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.1,
        )

        pandas_expr = completion.choices[0].message.content.strip().strip("`").strip()
        if pandas_expr.startswith("python"): pandas_expr = pandas_expr[6:].strip()

        forbidden = ["import ", "exec(", "eval(", "open(", "os.", "sys.", "__", "subprocess", "shutil", "socket"]
        if any(f in pandas_expr for f in forbidden):
            return {"status": "error", "message": "Cannot execute system operations.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": ""}

        if pandas_expr in ("None", ""):
            return {"status": "error", "message": "Insufficient data to answer this question.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": ""}

        try:
            result_raw = eval(pandas_expr, {"df": df, "pd": pd, "np": np, "__builtins__": {}})
        except Exception as eval_err:
            return {"status": "error", "message": f"Insufficient data or column mismatch.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": pandas_expr}

        if result_raw is None:
            return {"status": "error", "message": "Insufficient data to answer this question with the available columns.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": pandas_expr}

        if isinstance(result_raw, pd.DataFrame):
            if result_raw.empty: return {"status": "error", "message": "No matching records found.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": pandas_expr}
            result_data = numpy_to_python(result_raw.head(10).replace({pd.NA: None, float("nan"): None, float("inf"): None}).to_dict(orient="records"))
            result_type, result_summary = "table", f"{len(result_data)} rows returned"
        elif isinstance(result_raw, pd.Series):
            if result_raw.empty: return {"status": "error", "message": "No matching records found.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": pandas_expr}
            result_data = numpy_to_python(result_raw.head(10).to_dict())
            result_type, result_summary = "series", str(result_data)[:300]
        elif isinstance(result_raw, dict):
            result_data = numpy_to_python(result_raw)
            result_type, result_summary = "dict", str(result_data)[:300]
        else:
            result_data = numpy_to_python(result_raw)
            result_type, result_summary = "value", str(result_data)

        explain_prompt = f"""The user asked: "{payload.question}"\nDataset: {meta.get('title', 'Government Dataset')}\nResult: {str(result_summary)[:400]}\nWrite ONE clear sentence explaining what this means for a citizen. Use the actual number."""
        explanation_resp = groq_client.chat.completions.create(model="llama-3.1-8b-instant", messages=[{"role": "user", "content": explain_prompt}], max_tokens=100, temperature=0.3)

        return {"status": "success", "question": payload.question, "pandas_expr": pandas_expr, "result_type": result_type, "result": result_data, "explanation": explanation_resp.choices[0].message.content.strip()}

    except Exception as e:
        return {"status": "error", "message": "Insufficient data.", "question": payload.question, "result_type": "", "result": None, "explanation": "", "pandas_expr": ""}


# ─── ENDPOINT 5: CORRELATION (NOW WITH CUSTOM QUERIES!) ───────────────────────
@app.post("/api/correlate")
async def correlate_datasets(payload: CorrelationPayload):
    try:
        def get_summary(dataset_id: str) -> dict:
            df, meta = fetch_and_clean_df(dataset_id)
            insights, flags = run_analytics(df)
            return {
                "title": meta.get("title", "Unknown"), "rows": int(len(df)), "columns": df.columns.tolist()[:12],
                "analyzed_field": insights.get("analyzed_field"), "average": float(insights.get("average", 0)),
                "max_value": float(insights.get("max_value", 0)), "total_sum": float(insights.get("total_sum", 0)),
                "anomaly_count": int(len(flags)), "top_anomalies": [f["entity"] for f in flags[:3]], "tags": meta.get("tags", []),
            }

        summary_a = get_summary(payload.dataset_id_a)
        summary_b = get_summary(payload.dataset_id_b)

        prompt = f"""You are a senior civic policy analyst. Two Indian government datasets have been analyzed.

Dataset A — {summary_a['title']}:
- {summary_a['rows']} records | Metric: {summary_a['analyzed_field']} (avg: {summary_a['average']:.2f}, max: {summary_a['max_value']:.2f})
- Anomalous entities: {summary_a['top_anomalies']}
- Columns: {summary_a['columns'][:8]}

Dataset B — {summary_b['title']}:
- {summary_b['rows']} records | Metric: {summary_b['analyzed_field']} (avg: {summary_b['average']:.2f}, max: {summary_b['max_value']:.2f})
- Anomalous entities: {summary_b['top_anomalies']}
- Columns: {summary_b['columns'][:8]}
"""
        
        # MAGICAL HACKATHON FEATURE: Custom Prompt Injection
        if payload.query:
            prompt += f"\nUser Question: '{payload.query}'\nAnswer this specific question concisely based on the data provided. Cite numbers from the summaries above. Maximum 4 sentences."
        else:
            prompt += f"\nIn 4-5 sentences: What relationships exist? What can policymakers learn? Flag shared outliers. What should citizens know? Be specific."

        completion = groq_client.chat.completions.create(model="llama-3.1-8b-instant", messages=[{"role": "user", "content": prompt}], max_tokens=350, temperature=0.45)
        shared_entities = list(set(summary_a["top_anomalies"]) & set(summary_b["top_anomalies"]))

        return {
            "status": "success", 
            "dataset_a": summary_a["title"], 
            "dataset_b": summary_b["title"], 
            "shared_anomaly_entities": shared_entities, 
            "correlation_analysis": completion.choices[0].message.content.strip(), 
            "summary_a": summary_a, 
            "summary_b": summary_b
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── ENDPOINT 6: SAVE REPORT ──────────────────────────────────────────────────
@app.post("/api/save-report")
async def save_report(payload: ReportPayload):
    try:
        report_id = str(uuid.uuid4())[:8].upper()
        supabase.table("public_reports").insert({
            "id": report_id, "dataset_title": payload.dataset_title, "stats": payload.stats, "flags": payload.flags,
            "ai_analysis": payload.ai_analysis, "chart_data": payload.chart_data, "nl_queries": payload.nl_queries,
        }).execute()
        return {"status": "success", "report_id": report_id, "share_url": f"/report/{report_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/get-report/{report_id}")
async def get_report(report_id: str):
    try:
        resp = supabase.table("public_reports").select("*").eq("id", report_id.upper()).execute()
        if not resp.data: raise HTTPException(status_code=404, detail="Report not found")
        return {"status": "success", "report": resp.data[0]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


# ─── ENDPOINT 7: SEARCH ───────────────────────────────────────────────────────
@app.post("/api/search")
async def relevance_search(search: SearchQuery):
    try:
        query = search.query.lower().strip()

        # Dynamic fallback: Search everything if query is generic
        if not query:
            res = supabase.table("data_catalog").select("*").limit(12).execute()
            for d in res.data: d["relevance_confidence"] = "98%"
            return {"status": "success", "suggested_dept": "All", "datasets": res.data}

        if any(word in query for word in ["accident", "crash", "traffic", "bus"]): suggested_dept = "Transport"
        elif any(word in query for word in ["hospital", "sick", "disease", "health"]): suggested_dept = "Health"
        elif any(word in query for word in ["money", "spend", "cost", "budget"]): suggested_dept = "Finance"
        elif any(word in query for word in ["road", "water", "park", "building"]): suggested_dept = "Infrastructure"
        else: suggested_dept = "Governance"

        stop_words = {"why", "are", "there", "is", "what", "how", "the", "in", "of", "and", "a", "to", "show", "me", "for", "give", "find", "get", "data", "dataset", "about", "all", "list", "can", "you"}
        search_words = [w for w in re.split(r"\W+", query) if w not in stop_words and len(w) > 2]
        if not search_words: search_words = [query]

        synonym_graph = {"accident": ["fatal", "traffic", "motor", "rto", "killed"], "money": ["budget", "finance", "lakh", "rs", "expenditure", "revenue"], "road": ["infrastructure", "length", "paved"], "hospital": ["clinic", "uphc", "health", "bed"]}
        expanded = set(search_words)
        for w in search_words:
            for k, syns in synonym_graph.items():
                if w in k or k in w: expanded.update(syns); expanded.add(k)

        all_data_res = supabase.table("data_catalog").select("*").execute()
        scored = []

        for ds in all_data_res.data:
            score = 0
            title = str(ds.get("title") or "").lower()
            desc = str(ds.get("description") or "").lower()
            tags = [str(t).lower() for t in (ds.get("tags") or [])]
            headers = [str(h).lower() for h in (ds.get("column_headers") or [])]

            for word in expanded:
                if word in title: score += 15
                if any(word in t for t in tags): score += 10
                if any(word in h for h in headers): score += 8
                if word in desc: score += 5

            if score > 0:
                ds["relevance_confidence"] = f"{min(99, 65 + score)}%"
                ds["_score"] = score
                scored.append(ds)

        scored.sort(key=lambda x: x["_score"], reverse=True)
        for ds in scored: del ds["_score"]

        return {"status": "success", "results_count": len(scored), "suggested_dept": suggested_dept, "datasets": scored[:12]}

    except Exception as e:
        return {"status": "error", "message": "Search failed."}


# ─── ENDPOINT 8: SEED (LIVE DATA AGGREGATOR) ──────────────────────────────────
@app.post("/api/seed")
async def seed_catalog(keyword: str = "health", limit: int = 10):
    try:
        live_datasets = fetch_open_gov_data(keyword, limit)
        if not live_datasets:
            return {"status": "error", "message": "Failed to fetch live datasets from open data portals."}

        inserted, skipped = [], []
        for record in live_datasets:
            try:
                existing = supabase.table("data_catalog").select("id").eq("title", record["title"]).execute()
                if existing.data:
                    skipped.append(record["title"])
                    continue
                supabase.table("data_catalog").insert(record).execute()
                inserted.append(record["title"])
            except Exception as e:
                skipped.append(f"{record['title']} (error: {str(e)[:50]})")

        return {
            "status": "success",
            "keyword": keyword,
            "inserted": len(inserted),
            "skipped": len(skipped),
            "titles": inserted,
            "note": "Aggregated dynamically from live Open Government Data APIs."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── ENDPOINT 9: SEED ALL (MULTI-DOMAIN AGGREGATOR) ───────────────────────────
@app.post("/api/seed-all")
async def seed_all():
    domains = ["finance", "infrastructure", "health", "transport"]
    inserted, skipped = [], []
    
    for domain in domains:
        live_datasets = fetch_open_gov_data(domain, limit=5)
        for record in live_datasets:
            try:
                existing = supabase.table("data_catalog").select("id").eq("title", record["title"]).execute()
                if existing.data:
                    skipped.append(record["title"])
                    continue
                supabase.table("data_catalog").insert(record).execute()
                inserted.append(record["title"])
            except Exception as e:
                skipped.append(f"{record['title']} ({str(e)[:40]})")

    return {
        "status": "success",
        "inserted": len(inserted),
        "skipped": len(skipped),
        "all_titles": inserted,
        "note": "Multi-domain live aggregation complete."
    }


# ─── HEALTH ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "✅ InsightAR Civic Engine Active",
        "groq_model": "llama-3.1-8b-instant",
        "architecture": "Dynamic Live API Aggregation",
        "endpoints": [
            "GET  /api/jit-fetch/{id}",
            "GET  /api/jit-stream/{id}",
            "POST /api/ai-analyze",
            "POST /api/nl-query",
            "POST /api/correlate",
            "POST /api/save-report",
            "GET  /api/get-report/{id}",
            "POST /api/search",
            "POST /api/seed         ← Fetches LIVE datasets from Gov CKAN",
            "POST /api/seed-all     ← Aggregates multi-domain live data",
        ],
    }