import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("🚨 Missing SUPABASE_URL or SUPABASE_KEY in .env file")

# Create the REST API client
supabase: Client = create_client(url, key)