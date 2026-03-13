from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import supabase

app = FastAPI(title="InsightAR Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_TABLES = ["budget_allocations", "raw_tenders"]

@app.get("/health")
def health_check():
    return {"status": "✅ Engine is live and connected via REST API"}

@app.get("/api/data/{table_name}")
def get_table_data(table_name: str, limit: int = 100):
    """Fetches the existing data your friend uploaded to Supabase"""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Table not allowed")
        
    try:
        # Fetch the data directly from Supabase
        response = supabase.table(table_name).select("*").limit(limit).execute()
        
        # Return it as clean JSON for the frontend
        return {
            "table": table_name, 
            "total_fetched": len(response.data), 
            "data": response.data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))