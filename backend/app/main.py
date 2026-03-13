import os
import math
import pandas as pd
import requests
from io import StringIO
from collections import Counter
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# 1. INITIALIZATION
load_dotenv()
from app.database import supabase

app = FastAPI(title="InsightAR Civic Intelligence Engine")

# ENABLE CORS (Crucial for Next.js connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchQuery(BaseModel):
    query: str
def sanitize_float(val):
    """Ensure we never send NaN or Infinity to the frontend."""
    if pd.isna(val) or math.isinf(val):
        return 0.0
    return float(val)

@app.get("/api/jit-fetch/{dataset_id}")
async def jit_fetch_dataset(dataset_id: str, preview_limit: int = 50):
    try:
        # 1. Fetch Metadata
        response = supabase.table("data_catalog").select("*").eq("id", dataset_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Dataset not found")
            
        dataset_meta = response.data[0]
        source_url = dataset_meta.get("direct_csv_link") or dataset_meta.get("source_url")

        # 2. Robust Download
        req = requests.get(source_url, timeout=15)
        req.raise_for_status()
        
        try:
            df = pd.read_csv(StringIO(req.text))
        except:
            df = pd.read_csv(StringIO(req.content.decode('latin-1')))

        # 3. Aggressive Cleaning
        for col in df.columns:
            if df[col].dtype == 'object':
                try:
                    cleaned_col = df[col].astype(str).str.replace(',', '').str.strip()
                    df[col] = pd.to_numeric(cleaned_col, errors='ignore')
                except:
                    pass

        # 4. Analytics Engine with NaN Guards
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        useful_numeric = [c for c in numeric_cols if not any(x in c.lower() for x in ["id", "sl", "no", "year"])]
        
        insights = {
            "analyzed_field": "N/A",
            "total_sum": 0.0,
            "average": 0.0,
            "max_value": 0.0,
            "data_points": len(df)
        }
        flags = []

        if useful_numeric:
            target_col = useful_numeric[-1]
            # Coerce everything to numeric and drop NaNs for the calculation
            clean_series = pd.to_numeric(df[target_col], errors='coerce').dropna()
            
            if not clean_series.empty:
                avg = clean_series.mean()
                std_dev = clean_series.std()
                
                # Use sanitize_float helper for every single insight value
                insights = {
                    "analyzed_field": str(target_col),
                    "total_sum": sanitize_float(clean_series.sum()),
                    "average": sanitize_float(avg),
                    "max_value": sanitize_float(clean_series.max()),
                    "data_points": len(df)
                }

                # Anomaly detection only if we have a valid std_dev
                if not pd.isna(std_dev) and std_dev > 0:
                    threshold = avg + (2 * std_dev)
                    anomalies = df[pd.to_numeric(df[target_col], errors='coerce') > threshold]
                    
                    for index, row in anomalies.head(5).iterrows(): # Limit flags to top 5
                        entity = row.get('Ward Name') or row.get('Location') or row.get('District') or f"Record {index}"
                        val = pd.to_numeric(row[target_col], errors='coerce')
                        flags.append({
                            "type": "Spending/Value Anomaly",
                            "entity": str(entity),
                            "value": sanitize_float(val),
                            "message": f"'{entity}' is {round(val/avg if avg != 0 else 0, 1)}x higher than average."
                        })

        # 5. FINAL SANITIZATION - This stops the ValueError
        # We fill all remaining NaNs/Infs with None (JSON null)
        df_clean = df.head(preview_limit).replace({pd.NA: None, float('nan'): None, float('inf'): None, float('-inf'): None})
        # Double check insights too
        final_insights = {k: (v if not isinstance(v, float) or not math.isnan(v) else 0.0) for k, v in insights.items()}

        return {
            "status": "success",
            "metadata": dataset_meta,
            "audit": {
                "viz_mode": "bar", # You can keep your existing logic here
                "primary_metric": str(final_insights["analyzed_field"]),
                "summary": f"Analyzed {len(df)} records.",
                "stats": final_insights,
                "flags": flags
            },
            "data": df_clean.to_dict(orient="records")
        }

    except Exception as e:
        print(f"!!! CRITICAL_NODE_CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail="Data Sanitization Error")
# 3. THE UNIVERSAL SEMANTIC SEARCH (IDF LOGIC)
@app.post("/api/search")
async def semantic_search(search: SearchQuery):
    """
    Google-style ranking: Prioritizes rare/specific tags over generic ones like 'BBMP'.
    """
    try:
        # Step 1: Calculate Global Tag Frequency for weighting
        catalog_res = supabase.table("data_catalog").select("tags").execute()
        all_catalog_tags = [t for row in catalog_res.data for t in (row.get('tags') or [])]
        tag_counts = Counter(all_catalog_tags)
        total_docs = len(catalog_res.data)

        # Step 2: Tag Extraction from Query
        tags_master_res = supabase.table("master_tags").select("tag_name").execute()
        master_tags = [t['tag_name'] for t in tags_master_res.data]
        
        query_lower = search.query.lower()
        valid_tags = []
        for t in master_tags:
            t_lower = t.lower()
            if t_lower in query_lower or any(word == t_lower for word in query_lower.split()):
                valid_tags.append(t)

        if not valid_tags:
            return {"status": "error", "message": "No matching civic categories found."}

        # Step 3: Weighted Scoring (Inverse Document Frequency)
        dataset_scores = {}
        for tag in valid_tags:
            occurrence = tag_counts.get(tag, 1)
            # High occurrence (generic) = Low weight. Low occurrence (specific) = High weight.
            dynamic_weight = math.log10(total_docs / occurrence) + 1.0
            
            # Huge bonus for multi-word matches (e.g. 'female deaths')
            if " " in tag:
                dynamic_weight *= 3.0

            result = supabase.table("data_catalog").select("*").contains("tags", [tag]).execute()
            
            for ds in result.data:
                ds_id = ds['id']
                if ds_id not in dataset_scores:
                    dataset_scores[ds_id] = {"score": dynamic_weight, "data": ds}
                else:
                    dataset_scores[ds_id]["score"] += dynamic_weight

        # Step 4: Quality Filtering & Ranking
        if not dataset_scores:
            return {"status": "error", "message": "No datasets found."}
            
        max_score = max(item["score"] for item in dataset_scores.values())
        final_output = []
        
        # Sort by score and only keep results that meet the 40% quality threshold
        for item in sorted(dataset_scores.values(), key=lambda x: x["score"], reverse=True):
            if item["score"] >= (max_score * 0.4): 
                ds_data = item["data"]
                ds_data["relevance_confidence"] = f"{round((item['score']/max_score)*100)}%"
                final_output.append(ds_data)

        return {
            "status": "success",
            "query_analysis": {"extracted_tags": valid_tags},
            "results_count": len(final_output),
            "datasets": final_output[:10] 
        }

    except Exception as e:
        print(f"!!! SEARCH ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "✅ Civic Engine Active"}