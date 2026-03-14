# CivLib — Civic Intelligence Engine

> An open government data platform that aggregates datasets from multiple sources, provides AI-powered analysis, natural language querying, anomaly detection, and interactive dashboards — built for citizens, researchers, and policymakers.

---

## What It Does

Most government data platforms show you tables. InsightAR lets you **ask questions in plain English** and get real answers from live government datasets — no SQL, no data science degree required.

- **Search** across a curated catalog of government datasets (BBMP, Karnataka, India-wide)
- **JIT Fetch** — downloads and analyzes live CSVs from government portals on demand, always fresh
- **AI Analysis** — Groq LLM (llama-3.1-8b) writes a plain-English summary of every dataset
- **Natural Language Query** — type "which ward has the highest spending?" and get a direct answer
- **Anomaly Detection** — statistical outlier detection (mean + 2σ) with human-readable flags
- **Cross-Dataset Correlation** — AI identifies patterns and shared outliers across two datasets simultaneously
- **Shareable Reports** — one-click civic audit report with a public URL

---

## Demo

> **Live demo video:** [Insert YouTube link here] > **Live app:** [Insert Vercel URL here]

---

## Architecture

```
User → Next.js Frontend (port 3000)
            ↓ search
       FastAPI Backend (port 8000)
            ↓ metadata          ↓ AI (NL query, analysis, correlation)
       Supabase DB           Groq API (llama-3.1-8b-instant)
            ↓ CSV URL
       Government Portals (data.gov.in, BBMP, Karnataka OGD)
            live fetch on every request — never stale
```

---

## Tech Stack

| Layer           | Technology                                 |
| --------------- | ------------------------------------------ |
| Frontend        | Next.js 15, TypeScript, Tailwind CSS       |
| Charts          | Recharts (bar, line, area)                 |
| Animations      | Framer Motion                              |
| Backend         | FastAPI (Python)                           |
| Data processing | Pandas, NumPy                              |
| AI / LLM        | Groq API — llama-3.1-8b-instant            |
| Database        | Supabase (PostgreSQL)                      |
| Streaming       | Server-Sent Events (SSE)                   |
| Data sources    | data.gov.in, BBMP Open Data, Karnataka OGD |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- A Supabase account (free tier works)
- A Groq API key (free at console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/DILIP-SHEESH/bap
cd bap
```

### 2. Set up Supabase

Run this SQL in your Supabase SQL editor (Dashboard → SQL Editor → New Query):

```sql
-- Dataset catalog
create table if not exists data_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_url text,
  direct_csv_link text,
  tags text[],
  column_headers text[],
  created_at timestamptz default now()
);

-- Shareable public audit reports
create table if not exists public_reports (
  id text primary key,
  dataset_title text,
  stats jsonb,
  flags jsonb,
  ai_analysis text,
  chart_data jsonb,
  nl_queries jsonb,
  created_at timestamptz default now()
);

-- Allow public read/write on reports
alter table public_reports enable row level security;
create policy "Public reports readable" on public_reports for select using (true);
create policy "Public reports insertable" on public_reports for insert with check (true);
```

### 3. Configure environment variables

Create `backend/.env`:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### 4. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 5. Seed the dataset catalog

Open `http://localhost:8000/docs` in your browser.
Find `/api/seed-all` → click **Try it out** → click **Execute**.

This inserts 12 curated government datasets instantly. No external API required.

### 6. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` — you should see the dataset catalog.

---

## API Endpoints

| Method | Endpoint               | Description                                      |
| ------ | ---------------------- | ------------------------------------------------ |
| GET    | `/api/jit-fetch/{id}`  | Fetch + analyze a dataset live from source       |
| GET    | `/api/jit-stream/{id}` | SSE stream with live progress steps              |
| POST   | `/api/ai-analyze`      | Groq AI summary of dataset statistics            |
| POST   | `/api/nl-query`        | Natural language → pandas → plain English answer |
| POST   | `/api/correlate`       | Cross-dataset AI correlation analysis            |
| POST   | `/api/save-report`     | Save full audit as shareable public URL          |
| GET    | `/api/get-report/{id}` | Retrieve a saved public report                   |
| POST   | `/api/search`          | Keyword relevance search across catalog          |
| POST   | `/api/seed`            | Seed catalog by keyword (hardcoded datasets)     |
| POST   | `/api/seed-all`        | Insert all 12 curated datasets at once           |
| POST   | `/api/add-dataset`     | Manually add any dataset by CSV URL              |
| GET    | `/health`              | Service status check                             |

---

## Key Features Explained

### JIT (Just-in-Time) Data Fetching

Datasets are never cached. Every time a user opens a dataset, the backend downloads the live CSV from the government portal, cleans it, runs analytics, and returns fresh results. This means the data is always current — a key advantage over traditional platforms that pre-load everything.

### Natural Language Query Engine

User types a plain-English question → Groq generates a pandas expression → executed safely in a sandboxed eval → Groq explains the result in one sentence. Supports value lookups, aggregations, rankings, and filtering.

### Statistical Anomaly Detection

Uses mean + 2 standard deviations threshold. Any entity (ward, district, location) with a value exceeding this threshold is flagged with its exact deviation score (σ). Human-readable messages like "Rajajinagar is 4.2x higher than average" make findings immediately actionable.

### Cross-Dataset Correlation

Fetches two datasets simultaneously, computes statistical summaries for each, identifies shared anomalous entities (outliers appearing in both), and asks Groq to reason about what the pattern means for policymakers.

### Live SSE Streaming

The loading screen is not a spinner — it's a live feed of what the backend is actually doing: connecting → downloading X KB → parsing rows × columns → cleaning → detecting anomalies → complete. Judges and users see real-time progress.

---

## Problem Statement Coverage

| Requirement                                          | Implementation                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Aggregates government datasets from multiple sources | JIT fetch from data.gov.in, BBMP, Karnataka OGD                              |
| Searchable datasets                                  | Weighted keyword relevance search (title, tags, column headers, description) |
| Interactive dashboards                               | Bar/line/area charts with viz switcher, anomaly highlighting                 |
| Data exploration tools                               | Natural language query engine, data table with anomaly rows                  |
| Visualization                                        | Recharts with live data, σ-scored anomaly flags                              |
| Analytics                                            | Statistical analysis, cross-dataset correlation, AI summaries                |
| API access                                           | 11 REST endpoints, fully documented at /docs                                 |
| Shareable results                                    | Public report URLs saved to Supabase                                         |

---

## Project Structure

```
bap/
├── backend/
│   ├── app/
│   │   ├── main.py          # All FastAPI endpoints
│   │   └── database.py      # Supabase client
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Homepage — search + dataset catalog
│   │   └── dataset/
│   │       └── [id]/
│   │           └── page.tsx # Dataset audit dashboard
│   └── package.json
└── README.md
```

---

## Requirements

```
fastapi
uvicorn[standard]
pydantic
python-dotenv
supabase
pandas
numpy
requests
groq
openpyxl
xlrd
pdfplumber
```

---

## Team

Built for the Open Data Hackathon 2025.
InsightAR — making government data speak plain English.
