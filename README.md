<div align="center">

<!-- HERO BANNER -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0f172a,1e3a5f,2563eb&height=200&section=header&text=CivLib&fontSize=72&fontColor=ffffff&fontAlignY=38&desc=Civic%20Intelligence%20Engine%20for%20Bengaluru&descAlignY=60&descColor=93c5fd&animation=fadeIn" width="100%" />

<br/>

<p align="center">
  <img src="https://img.shields.io/badge/Status-LIVE__AUDIT__ACTIVE-22c55e?style=for-the-badge&labelColor=0f172a" />
  <img src="https://img.shields.io/badge/Model-Llama--3.1--8b-2563eb?style=for-the-badge&logo=meta&logoColor=white&labelColor=0f172a" />
  <img src="https://img.shields.io/badge/Stack-Next.js%2015%20%2B%20FastAPI-f97316?style=for-the-badge&logo=nextdotjs&logoColor=white&labelColor=0f172a" />
  <img src="https://img.shields.io/badge/Data-Open%20Gov%20APIs-6366f1?style=for-the-badge&logo=databricks&logoColor=white&labelColor=0f172a" />
  <img src="https://img.shields.io/badge/License-MIT-94a3b8?style=for-the-badge&labelColor=0f172a" />
</p>

<br/>

<h3 align="center">
  <samp>
    Government data is public. Accountability shouldn't require a PhD.<br/>
    <strong>CivLib turns 91,000-row civic datasets into actionable intelligence — in seconds.</strong>
  </samp>
</h3>

<br/>

<p align="center">
  <a href="#-live-demo"><strong>Live Demo</strong></a> ·
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-architecture"><strong>Architecture</strong></a> ·
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-screenshots"><strong>Screenshots</strong></a>
</p>

</div>

---

## 🌆 What is CivLib?

**CivLib** is an open-source civic intelligence platform built for Bengaluru (and any city that publishes open government data). It aggregates datasets from official portals, runs automated statistical audits, flags anomalies, and lets any citizen — researcher, journalist, or policymaker — interrogate the data in plain English.

No data science background required. No API keys to manage. Just ask a question.

> *Built in 48 hours for a civic-tech hackathon. Powered by Groq's LLaMA 3.1, FastAPI, Next.js 15, and a relentless belief that public data should be genuinely public.*

---

## ✨ Features

### 🔴 Live Streaming Data Acquisition
Datasets are never pre-cached into a database. Every audit is a **live JIT (Just-in-Time) fetch** directly from government portals — CSV, XLSX, or PDF — streamed to the browser with real-time progress indicators.

```
Connecting to Supabase catalog...          5%
Downloading 2.3 MB of CSV data...         28%
Parsed 91,620 rows × 14 columns...        48%
Running anomaly detection...              80%
Detected 3 anomalies across 91,620 rows  100%
```

### 🧠 AI-Powered Audit Terminal
Every dataset gets a **GROQ-accelerated Llama-3.1-8b analysis** streamed character-by-character into a terminal-style UI. The AI cites actual numbers, names specific outlier entities, and explains what the data means for citizens.

### 💬 Natural Language Query Engine
Ask questions in plain English. The system uses Groq to generate a pandas expression, executes it safely against the live dataframe, and returns a plain-language explanation:

- *"Which ward has the highest complaint count?"*
- *"How many records are above the average budget allocation?"*
- *"Show me the top 5 outliers"*

### 🔗 Cross-Dataset Correlation Engine
Select any two datasets from the catalog and run an AI-powered correlation analysis. The engine:
- Fetches and audits both datasets in parallel
- Identifies **shared anomaly entities** (locations/departments appearing as outliers in both)
- Synthesizes a 4–5 sentence policy-grade insight using Llama 3.1

### 🗺️ Auto-Detected Geo Map
When a dataset contains latitude/longitude columns (auto-detected via regex, no configuration needed), an interactive Leaflet map renders automatically with:
- **Heat-colored markers** (blue → red) scaled by relative metric value
- Tooltip with entity name, metric value, and coordinates
- Auto-fitting bounds for any geography

### 🔬 Surgical Region Slicer
Filter any dataset to a specific Ward, District, Pincode, or any string value — without reloading. The backend re-runs the full statistical analysis on only the matching rows, so anomaly detection is always local to the slice.

### 📊 Master Visual Lab
Four chart types — Bar, Line, Area, Pie — rendered via Recharts with **intelligent metric selection**:
- Mirrors the backend's `run_analytics` algorithm: skips ID/coordinate columns
- Picks the **highest-variance** numeric column as the primary metric
- Anomalous entities render as red bars
- Y-axis auto-formats (`22k`, `4.5M`) for readability

### 📄 Shareable Audit Reports
One-click report generation saves stats, AI analysis, anomaly flags, and NL query history to Supabase and returns a public shareable URL. Falls back to a downloadable JSON if the backend is unavailable.

### 🔍 Semantic Dataset Search
The search engine expands queries with a synonym graph (`accident → fatal, rto, traffic, motor`), scores datasets by title/tags/headers/description relevance, and returns ranked results with confidence percentages.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 15 (App Router) · TypeScript · Tailwind CSS        │
│  Recharts · Framer Motion · React-Leaflet                   │
└────────────────────┬────────────────────────────────────────┘
                     │  EventSource (SSE streaming)
                     │  REST (POST /api/*)
┌────────────────────▼────────────────────────────────────────┐
│                        BACKEND                              │
│  FastAPI · Python · Pandas · NumPy                          │
│  Groq SDK (Llama-3.1-8b-instant)                            │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
┌──────────▼──────┐        ┌──────────▼──────────────────────┐
│   Supabase      │        │   Live Open Government APIs      │
│   (Catalog DB   │        │   data.gov.in  ·  catalog.data   │
│    + Reports)   │        │   .gov · Direct CSV/XLSX/PDF     │
└─────────────────┘        └─────────────────────────────────┘
```

**Data flow for a single dataset audit:**
1. Browser opens an `EventSource` to `/api/jit-stream/{id}`
2. Backend fetches the raw file from the government portal URL stored in Supabase
3. Pandas parses and cleans the dataframe (handles encoding issues, unstructured regional data)
4. `run_analytics()` finds the highest-variance useful numeric column, runs 2σ outlier detection
5. Results stream to the browser as SSE events with progress percentages
6. On completion, the full payload is sent as the final `done` event
7. React triggers Groq AI analysis as a separate POST call, streamed to the terminal

---

## 📸 Screenshots

### 🏠 Home — Dataset Discovery
> Semantic search across Bengaluru's civic data catalog. Type in natural language, filter by department.

![Home Screen](https://github.com/DILIP-SHEESH/bap/blob/main/images/home.png?raw=true)

---

### 📊 Audit Dashboard — Live Data Intelligence
> Real-time streaming audit of 91,620 BBMP grievance records. Cross-dataset correlation active.

![Audit Dashboard](https://github.com/DILIP-SHEESH/bap/blob/main/images/dashboard.png?raw=true)

---

### 🧠 AI Inference Terminal
> Llama-3.1-8b streams a 4-sentence analysis citing actual statistics and naming outlier entities.

![AI Terminal](https://github.com/DILIP-SHEESH/bap/blob/main/images/ai-terminal.png?raw=true)

---

### 🔗 Cross-Dataset Correlation Engine
> Two datasets loaded simultaneously. Shared anomaly entities flagged in red.

![Correlation Engine](https://github.com/DILIP-SHEESH/bap/blob/main/images/correlation.png?raw=true)

---

### 🗺️ Geo Location Map
> Auto-detected lat/lng columns rendered as a heat-colored interactive map. Zero configuration.

![Geo Map](https://github.com/DILIP-SHEESH/bap/blob/main/images/map.png?raw=true)

> **Note:** Screenshots above are placeholders — replace with actual paths once uploaded to the repo. The live app is running at Bengaluru on `localhost:3000` (see demo link above).

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- A [Groq API key](https://console.groq.com) (free tier works)
- A [Supabase](https://supabase.com) project

### 1. Clone

```bash
git clone https://github.com/DILIP-SHEESH/bap.git
cd bap
```

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Create .env
cat > .env << EOF
GROQ_API_KEY=your_groq_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
EOF

# Run
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local

# Run
npm run dev
```

### 4. Seed the Catalog

```bash
# Fetch live datasets from data.gov.in and catalog.data.gov
curl -X POST "http://localhost:8000/api/seed-all"
```

Open [http://localhost:3000](http://localhost:3000) 🚀

---

## 🗄️ Supabase Schema

Run this SQL in your Supabase dashboard:

```sql
-- Dataset catalog
create table data_catalog (
  id          bigserial primary key,
  title       text not null,
  description text,
  source_url  text,
  direct_csv_link text,
  tags        text[],
  column_headers text[]
);

-- Shareable audit reports
create table public_reports (
  id              text primary key,
  dataset_title   text,
  stats           jsonb,
  flags           jsonb,
  ai_analysis     text,
  chart_data      jsonb,
  nl_queries      jsonb,
  created_at      timestamptz default now()
);
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jit-stream/{id}` | SSE stream — live fetch, clean, analyze |
| `GET` | `/api/jit-stream/{id}?region=Whitefield` | Same with region filter applied |
| `POST` | `/api/ai-analyze` | Groq LLM analysis of stats + anomalies |
| `POST` | `/api/nl-query` | Natural language → pandas → answer |
| `POST` | `/api/correlate` | Cross-dataset AI correlation |
| `POST` | `/api/search` | Semantic dataset search |
| `POST` | `/api/save-report` | Persist audit report to Supabase |
| `GET` | `/api/get-report/{id}` | Retrieve a saved report |
| `POST` | `/api/seed` | Fetch datasets from CKAN by keyword |
| `POST` | `/api/seed-all` | Multi-domain live aggregation |
| `GET` | `/health` | Engine status |

---

## 🧮 How Anomaly Detection Works

The engine avoids naive ID-column detection through strict regex filtering, then selects the most statistically meaningful metric:

```python
# 1. Filter out noise columns (IDs, coordinates, phone numbers, etc.)
skip_regex = re.compile(
  r'\b(id|sl|no|sr|sno|pin|code|year|phone|mobile|lat|lng|latitude|longitude|index)\b',
  re.IGNORECASE
)
useful = [c for c in numeric_cols if not skip_regex.search(str(c))]

# 2. Pick highest-variance column (most meaningful signal)
best_col = max(useful, key=lambda c: series(c).var())

# 3. Flag outliers beyond 2 standard deviations
threshold = avg + (2.0 * std_dev)
anomalies = df[df[best_col] > threshold]
```

This ensures the chart and analysis are always about **real civic metrics** (complaint counts, budget allocations, incident rates) — never complaint IDs or row numbers.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | Next.js 15 (App Router, Turbopack) |
| **UI Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **Charts** | Recharts |
| **Maps** | React-Leaflet + OpenStreetMap |
| **Animations** | Framer Motion |
| **Backend Framework** | FastAPI |
| **Data Processing** | Pandas, NumPy |
| **AI Inference** | Groq Cloud (Llama-3.1-8b-instant) |
| **Database** | Supabase (PostgreSQL) |
| **Streaming** | Server-Sent Events (SSE) |
| **File Parsing** | CSV · XLSX (openpyxl/xlrd) · PDF (pdfplumber) |
| **Deployment** | Vercel (frontend) · Render/Railway (backend) |

---

## 📂 Project Structure

```
bap/
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # Home — dataset search & catalog
│   │   ├── dataset/[id]/
│   │   │   └── page.tsx              # Audit dashboard (main experience)
│   │   └── correlation/
│   │       └── page.tsx              # Standalone correlation engine
│   ├── components/
│   │   └── StopsMap.tsx              # Leaflet geo map component
│   └── public/
│       └── screenshots/              # App screenshots for README
│
└── backend/
    └── app/
        ├── main.py                   # All FastAPI endpoints
        └── database.py               # Supabase client init
```

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

```bash
# Fork → Clone → Branch → PR
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
```

---

## Team

Built for the Open Data Hackathon 2025.
InsightAR — making government data speak plain English.
