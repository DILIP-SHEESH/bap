import os
import pandas as pd
import requests
import time
from io import StringIO
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# 1. LOAD ENV VARIABLES
load_dotenv()

# We import supabase after loading dotenv
from app.database import supabase

# 2. CONFIGURATION & AI CLIENT
HF_TOKEN = os.getenv("HF_TOKEN")
# Using Llama 3.1 8B for fast, stable semantic routing
HF_API_URL = "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct"
headers = {"Authorization": f"Bearer {HF_TOKEN}"}

# 3. INITIALIZE THE ENGINE
app = FastAPI(title="InsightAR Civic Data Engine")

# Enable CORS for the frontend team
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class SearchQuery(BaseModel):
    query: str

# --- ENDPOINTS ---

@app.get("/health")
def health_check():
    """Sanity check for the judges."""
    return {"status": "✅ Engine is live and connected via Hugging Face"}

@app.get("/api/jit-fetch/{dataset_id}")
async def jit_fetch_dataset(dataset_id: str, preview_limit: int = 100):
    """
    The JIT Insights Engine: 
    Fetches raw CSV, cleans it, and performs AUTOMATED PROFILING & ANOMALY DETECTION.
    """
    try:
        # Step 1: Look up the source URL in Supabase
        response = supabase.table("data_catalog").select("*").eq("id", dataset_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Dataset not found in catalog")
            
        dataset_meta = response.data[0]
        source_url = dataset_meta.get("source_url")
        
        if not source_url:
            raise HTTPException(status_code=400, detail="No source URL found")

        # Step 2: Fetch the live CSV from source
        req = requests.get(source_url, timeout=10)
        req.raise_for_status() 
        
        # Step 3: Load into Pandas
        df = pd.read_csv(StringIO(req.text))

        # --- THE WINNING FEATURE: AUTOMATED INSIGHTS & RED FLAGS ---
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        insights = {}
        flags = []

        if numeric_cols:
            target_col = numeric_cols[-1] 
            avg = float(df[target_col].mean())
            std_dev = float(df[target_col].std())
            
            insights = {
                "analyzed_field": target_col,
                "total_sum": float(df[target_col].sum()),
                "average": round(avg, 2),
                "max_value": float(df[target_col].max()),
                "data_points": len(df)
            }

            # Anomaly Detection: Flag values that are significantly higher than the average (Z-score > 2)
            if std_dev > 0:
                anomalies = df[df[target_col] > (avg + 2 * std_dev)]
                for index, row in anomalies.iterrows():
                    entity = row.get('ward_name') or row.get('location') or row.get('ward_no') or f"Entry {index}"
                    flags.append({
                        "type": "High Spending/Value Alert",
                        "entity": entity,
                        "value": float(row[target_col]),
                        "message": f"{entity} is {round(row[target_col]/avg, 1)}x higher than the city average."
                    })

        # Step 4: Data Normalization
        df = df.dropna(how='all', axis=1) # Drop dead columns
        df = df.where(pd.notnull(df), None) # Fix NaNs for JSON safety
        
        return {
            "metadata": dataset_meta,
            "insights": insights,
            "flags": flags, # The Red Flags for the UI
            "total_rows_available": len(df),
            "data": df.head(preview_limit).to_dict(orient="records")
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JIT Engine Error: {str(e)}")

@app.get("/api/snapshot/{location_tag}")
async def get_location_snapshot(location_tag: str):
    """
    Knowledge Graph Feature: Aggregates all datasets related to a specific location/tag.
    """
    try:
        # Query datasets matching the tag (Case-insensitive)
        response = supabase.table("data_catalog").select("*").ilike("tags", f"%{location_tag}%").execute()
        datasets = response.data

        if not datasets:
            return {"status": "error", "message": f"No datasets indexed for {location_tag}"}

        summary = []
        for ds in datasets:
            summary.append({
                "title": ds['title'],
                "id": ds['id'],
                "description": ds['description']
            })

        return {
            "location": location_tag,
            "count": len(datasets),
            "relevant_datasets": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search")
async def semantic_search(search: SearchQuery):
    """
    The Brain: Matches plain English to Dataset IDs using Tags, Title, and Schema.
    """
    try:
        # 1. Fetch catalog with TAGS (Ward, Zone, etc.)
        catalog_res = supabase.table("data_catalog").select("id, title, description, column_headers, tags").execute()
        available = catalog_res.data
        if not available:
            raise HTTPException(status_code=500, detail="Database catalog is empty!")

        # 2. Build Smart Context
        catalog_ctx = ""
        for item in available:
            desc = (item.get('description') or "")[:120]
            tags = (item.get('tags') or "N/A")
            cols = (item.get('column_headers') or "N/A")[:100]
            catalog_ctx += f"ID: {item['id']} | T: {item['title']} | Tags: {tags} | Cols: {cols} | D: {desc}\n"

        # 3. Your Optimized Successful Prompt
        system_instructions = f"""
        You are an intelligent data router for a Bengaluru civic data platform. 
        The user will ask a question. Your ONLY job is to look at the available datasets below 
        and return the EXACT 'ID' of the relevant datasets.
        
        PRIORITIZE TAGS: If the user mentions a location (Indiranagar, HSR, Ward 80), look for matching Tags.
        
        Output ONLY the ID. Do not explain yourself. ONLY output the ID.
        If nothing matches, output: 'NOT_FOUND'.

        AVAILABLE DATASETS:
        {catalog_ctx}
        """

        # Llama 3.1 Prompt Template
        prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_instructions}<|eot_id|>" \
                 f"<|start_header_id|>user<|end_header_id|>\n\n{search.query}<|eot_id|>" \
                 f"<|start_header_id|>assistant<|end_header_id|>\n\n"

        # 4. Hugging Face API Call
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 20, 
                "return_full_text": False,
                "temperature": 0.01 
            }
        }
        
        response = requests.post(HF_API_URL, headers=headers, json=payload)
        
        if response.status_code == 503:
            return {"status": "loading", "message": "AI model is warming up, try again in 15 seconds."}
            
        output = response.json()
        
        # Text extraction and cleaning
        if isinstance(output, list) and len(output) > 0:
            matched_id = output[0].get('generated_text', '').strip()
        else:
            matched_id = output.get('generated_text', '').strip()

        # Clean any extra chatter (taking only the first word/line)
        matched_id = matched_id.split('\n')[0].split(' ')[0].strip()

        if "NOT_FOUND" in matched_id or not matched_id:
            return {"status": "error", "message": "No relevant data found for this query."}

        return {
            "status": "success",
            "matched_dataset_id": matched_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))