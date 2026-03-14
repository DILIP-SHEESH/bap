"use client"

import "leaflet/dist/leaflet.css"
import { use, useEffect, useState, useMemo, useRef } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import type { GeoPoint } from "../../components/StopsMap"

// ─── TYPES ────────────────────────────────────────────────────────────────────
type AuditFlag = {
  type: string; entity: string; value: number; message: string; deviation_score?: number
}
type AuditStats = {
  analyzed_field: string; total_sum: number; average: number
  max_value: number; min_value: number; std_dev: number; data_points: number
}
type AuditBlock = {
  viz_mode: string; primary_metric: string; summary: string
  stats: AuditStats; flags: AuditFlag[]
}
type APIResponse = {
  status: string; metadata: Record<string, any>; audit: AuditBlock; data: Record<string, any>[]
}
type StreamLog = { msg: string; pct: number }
type NLResult = {
  status: string; question: string; result_type: string
  result: any; explanation: string; pandas_expr: string; message?: string
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
const PIE_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#e2e8f0', '#cbd5e1']

const StopsMap = dynamic(() => import("../../components/StopsMap"), { ssr: false })

const LABEL_COLUMN_HINTS = ["name", "ward", "district", "location", "state", "city", "stop", "station", "area", "zone", "taluk", "village", "block", "region", "department", "category", "type", "title", "description"]

// Skip columns that are IDs or coordinates — same logic as backend run_analytics
const SKIP_METRIC_REGEX = /\b(id|sl|no|sr|sno|pin|code|year|phone|mobile|lat|lng|latitude|longitude|index)\b/i

function normalizeColumnName(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function isLatitudeColumn(key: string) {
  const n = normalizeColumnName(key)
  return /\blat(?:itude)?\b/.test(n)
}

function isLongitudeColumn(key: string) {
  const n = normalizeColumnName(key)
  return /\b(?:lng|lon|long|longitude)\b/.test(n)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseCoordinate(value: unknown, min: number, max: number): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed === null || parsed < min || parsed > max) return null
  return parsed
}

// ─── SMART CHART DATA BUILDER ─────────────────────────────────────────────────
// Mirrors the backend run_analytics logic: pick the highest-variance useful numeric column
function pickBestMetricColumn(data: Record<string, any>[], analyzedField: string | undefined): string | null {
  if (!data || data.length === 0) return null
  const keys = Object.keys(data[0])

  // 1. Trust the backend's analyzed_field if it resolves to real numbers
  if (analyzedField && analyzedField !== "N/A") {
    const values = data.map(r => toFiniteNumber(r[analyzedField])).filter((v): v is number => v !== null)
    if (values.length >= 3) return analyzedField
  }

  // 2. Find all numeric-looking columns, skip IDs/coords
  const numericCols = keys.filter(k => {
    if (SKIP_METRIC_REGEX.test(k)) return false
    const vals = data.slice(0, 20).map(r => toFiniteNumber(r[k])).filter((v): v is number => v !== null)
    return vals.length >= 3
  })

  if (numericCols.length === 0) return null

  // 3. Pick highest variance column (most meaningful signal)
  let bestCol = numericCols[0]
  let bestVariance = -1

  for (const col of numericCols) {
    const vals = data.map(r => toFiniteNumber(r[col])).filter((v): v is number => v !== null)
    if (vals.length < 3) continue
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
    if (variance > bestVariance) {
      bestVariance = variance
      bestCol = col
    }
  }

  return bestCol
}

function pickLabelColumn(row: Record<string, any>, excludeKeys: string[]): string {
  const keys = Object.keys(row).filter(k => !excludeKeys.includes(k))
  // Prefer columns matching label hints
  const labelKey = keys.find(k =>
    LABEL_COLUMN_HINTS.some(hint => normalizeColumnName(k).includes(hint))
  )
  if (labelKey) return labelKey
  // Fallback: first string column
  const strKey = keys.find(k => typeof row[k] === "string" && row[k].length > 0 && row[k].length < 80)
  return strKey ?? keys[0]
}

const SUGGESTED_QUESTIONS = [
  "Which record has the highest value?",
  "What is the average?",
  "How many records are above average?",
  "Show the top 5 records",
  "What is the total sum?",
  "Which entity appears most often?",
]

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function DatasetAuditDashboard({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [res, setRes] = useState<APIResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [streamLog, setStreamLog] = useState<StreamLog[]>([])

  const [vizType, setVizType] = useState<"bar" | "line" | "area" | "pie">("bar")
  const [activeTab, setActiveTab] = useState<"ai" | "nl" | "correlate">("ai")

  // REGION SLICER — no fixed search, just the input+button
  const [regionFilter, setRegionFilter] = useState("")
  const [activeRegion, setActiveRegion] = useState("")

  const [aiText, setAiText] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDone, setAiDone] = useState(false)

  const [nlQuestion, setNlQuestion] = useState("")
  const [nlResult, setNlResult] = useState<NLResult | null>(null)
  const [nlLoading, setNlLoading] = useState(false)
  const [nlHistory, setNlHistory] = useState<NLResult[]>([])

  const [correlateId, setCorrelateId] = useState("")
  const [correlateQuery, setCorrelateQuery] = useState("")
  const [correlateResult, setCorrelateResult] = useState<any>(null)
  const [correlateLoading, setCorrelateLoading] = useState(false)
  const [catalogDatasets, setCatalogDatasets] = useState<any[]>([])

  const [reportSaving, setReportSaving] = useState(false)
  const [reportUrl, setReportUrl] = useState("")

  const nlInputRef = useRef<HTMLInputElement>(null)
  const aiAnalysisKeyRef = useRef("")

  // ── STREAMING JIT FETCH ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(false)
    setStreamLog([])
    setRes(null)

    const url = activeRegion
      ? `${API}/api/jit-stream/${id}?region=${encodeURIComponent(activeRegion)}`
      : `${API}/api/jit-stream/${id}`

    const es = new EventSource(url)

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.done) {
        setRes(data.payload)
        setLoading(false)
        es.close()
      } else if (data.error) {
        setError(true)
        setLoading(false)
        es.close()
      } else {
        setStreamLog((prev) => [...prev, { msg: data.message, pct: data.progress }])
      }
    }

    es.onerror = () => {
      setError(true)
      setLoading(false)
      es.close()
    }

    return () => es.close()
  }, [id, activeRegion])

  // ── CATALOG FOR CORRELATION DROPDOWN — robust multi-strategy fetch ────────
  useEffect(() => {
    const loadCatalog = async () => {
      const queries = ["", "BBMP", "government", "civic", "data"]
      for (const q of queries) {
        try {
          const r = await fetch(`${API}/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
          })
          const d = await r.json()
          const datasets = d.datasets || []
          if (datasets.length > 0) {
            setCatalogDatasets(datasets)
            return
          }
        } catch {}
      }
    }
    loadCatalog()
  }, [])

  // ── GROQ AI ANALYSIS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!res || loading) return

    const runKey = JSON.stringify({
      id,
      title: res.metadata?.title ?? "Unknown Dataset",
      stats: res.audit?.stats ?? {},
      flags: res.audit?.flags ?? [],
    })
    if (aiAnalysisKeyRef.current === runKey) return
    aiAnalysisKeyRef.current = runKey

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const runAnalysis = async () => {
      setAiLoading(true)
      setAiText("")
      setAiDone(false)

      try {
        const r = await fetch(`${API}/api/ai-analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: res.metadata?.title ?? "Unknown Dataset",
            stats: res.audit?.stats ?? {},
            flags: res.audit?.flags ?? [],
          }),
        })
        const data = await r.json()
        const text: string = data.analysis ?? "Analysis unavailable."

        if (cancelled) return
        setAiLoading(false)

        let i = 0
        intervalId = setInterval(() => {
          if (cancelled) { if (intervalId) clearInterval(intervalId); return }
          i += 1
          setAiText(text.slice(0, i))
          if (i >= text.length) {
            if (intervalId) clearInterval(intervalId)
            setAiDone(true)
          }
        }, 16)
      } catch {
        if (cancelled) return
        setAiLoading(false)
        setAiText("AI analysis unavailable. Check GROQ_API_KEY.")
        setAiDone(true)
      }
    }

    runAnalysis()
    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [id, res, loading])

  // ── SMART CHART DATA ──────────────────────────────────────────────────────
  const { chartData, resolvedMetric } = useMemo(() => {
    if (!res?.data || !Array.isArray(res.data) || res.data.length === 0) {
      return { chartData: [], resolvedMetric: "N/A" }
    }

    const metricCol = pickBestMetricColumn(res.data, res.audit?.stats?.analyzed_field)
    if (!metricCol) return { chartData: [], resolvedMetric: "N/A" }

    const excludeKeys = [metricCol]
    if (isLatitudeColumn(metricCol)) excludeKeys.push(metricCol)

    const built = res.data.slice(0, 15).map((row) => {
      const labelKey = pickLabelColumn(row, excludeKeys)
      const rawVal = row[metricCol]
      const numVal = toFiniteNumber(rawVal)

      return {
        name: String(row[labelKey] ?? "N/A").substring(0, 14),
        value: numVal ?? 0,
        fullName: row[labelKey],
      }
    })

    return { chartData: built, resolvedMetric: metricCol }
  }, [res])

  // ── GEO MAP DATA — more aggressive detection ──────────────────────────────
  const geoMapData = useMemo(() => {
    if (!res?.data || !Array.isArray(res.data) || res.data.length === 0) return null

    const rows = res.data.slice(0, 300)
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

    // Broader lat/lng detection
    const latKeys = keys.filter(k => {
      const n = normalizeColumnName(k)
      return /\blat(?:itude)?\b/.test(n) || n === "lat" || n === "latitude"
    })
    const lngKeys = keys.filter(k => {
      const n = normalizeColumnName(k)
      return /\b(?:lng|lon|long|longitude)\b/.test(n) || n === "lng" || n === "lon" || n === "long" || n === "longitude"
    })

    if (latKeys.length === 0 || lngKeys.length === 0) return null

    let bestPair: { latKey: string; lngKey: string; validCount: number } | null = null

    for (const latKey of latKeys) {
      for (const lngKey of lngKeys) {
        const validCount = rows.reduce((count, row) => {
          const lat = parseCoordinate(row[latKey], -90, 90)
          const lng = parseCoordinate(row[lngKey], -180, 180)
          return lat !== null && lng !== null ? count + 1 : count
        }, 0)
        if (!bestPair || validCount > bestPair.validCount) {
          bestPair = { latKey, lngKey, validCount }
        }
      }
    }

    if (!bestPair || bestPair.validCount < 2) return null

    const labelKey = keys.find((key) =>
      key !== bestPair!.latKey &&
      key !== bestPair!.lngKey &&
      LABEL_COLUMN_HINTS.some((hint) => normalizeColumnName(key).includes(hint))
    ) ?? keys.find((key) => key !== bestPair!.latKey && key !== bestPair!.lngKey)

    const metricKey = resolvedMetric !== "N/A" && keys.includes(resolvedMetric)
      ? resolvedMetric
      : keys.find((key) =>
          key !== bestPair!.latKey &&
          key !== bestPair!.lngKey &&
          !SKIP_METRIC_REGEX.test(key) &&
          rows.some((row) => toFiniteNumber(row[key]) !== null)
        )

    const points: GeoPoint[] = rows.flatMap((row, index) => {
      const lat = parseCoordinate(row[bestPair!.latKey], -90, 90)
      const lng = parseCoordinate(row[bestPair!.lngKey], -180, 180)
      if (lat === null || lng === null) return []

      const labelValue = labelKey ? row[labelKey] : null
      const label = labelValue !== null && labelValue !== undefined && String(labelValue).trim()
        ? String(labelValue).slice(0, 80)
        : `Point ${index + 1}`

      const value = metricKey ? toFiniteNumber(row[metricKey]) ?? undefined : undefined
      return [{ lat, lng, label, value }]
    })

    if (points.length === 0) return null

    return {
      points: points.slice(0, 250),
      latKey: bestPair.latKey,
      lngKey: bestPair.lngKey,
    }
  }, [res, resolvedMetric])

  // ── NL QUERY ──────────────────────────────────────────────────────────────
  const askQuestion = async (question?: string) => {
    const q = question || nlQuestion
    if (!q.trim()) return
    setNlLoading(true)
    setNlResult(null)
    if (question) setNlQuestion(question)

    try {
      const r = await fetch(`${API}/api/nl-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, dataset_id: id }),
      })
      const data: NLResult = await r.json()
      setNlResult(data)
      if (data.status === "success") {
        setNlHistory((prev) => [data, ...prev].slice(0, 5))
      }
    } catch {
      setNlResult({ status: "error", message: "Connection failed.", question: q, result_type: "", result: null, explanation: "", pandas_expr: "" })
    } finally {
      setNlLoading(false)
    }
  }

  // ── CORRELATION ───────────────────────────────────────────────────────────
  const runCorrelation = async () => {
    if (!correlateId) return
    setCorrelateLoading(true)
    setCorrelateResult(null)

    try {
      const r = await fetch(`${API}/api/correlate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id_a: id,
          dataset_id_b: correlateId,
          query: correlateQuery || null,
        }),
      })
      const data = await r.json()
      setCorrelateResult(data)
    } catch {
      setCorrelateResult({ status: "error", correlation_analysis: "Failed to connect to AI correlation engine." })
    } finally {
      setCorrelateLoading(false)
    }
  }

  // ── SAVE REPORT ───────────────────────────────────────────────────────────
  const saveReport = async () => {
    setReportSaving(true)
    try {
      const r = await fetch(`${API}/api/save-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_title: res?.metadata?.title ?? "Civic Audit",
          stats: res?.audit?.stats ?? {},
          flags: res?.audit?.flags ?? [],
          ai_analysis: aiText,
          chart_data: chartData,
          nl_queries: nlHistory.map((h) => ({ q: h.question, explanation: h.explanation })),
        }),
      })
      const data = await r.json()
      if (data.status === "success") {
        setReportUrl(`${window.location.origin}${data.share_url}`)
      }
    } catch {
      const report = { dataset: res?.metadata?.title, analyzed_at: new Date().toISOString(), stats: res?.audit?.stats, anomalies: res?.audit?.flags, ai_analysis: aiText }
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `civic-audit-${id}.json`; a.click()
    } finally {
      setReportSaving(false)
    }
  }

  // ── LOADING STATE ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center font-mono px-8">
      <div className="w-full max-w-sm">
        <p className="text-blue-600 text-[10px] mb-8 animate-pulse uppercase tracking-[0.5em] font-bold text-center">
          {activeRegion ? `Surgically Extracting: ${activeRegion.toUpperCase()}` : "Live_Data_Acquisition"}
        </p>
        <div className="space-y-3">
          {streamLog.map((log, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: i === streamLog.length - 1 ? 1 : 0.35, x: 0 }}
              className="flex items-center gap-3 text-xs"
            >
              <span className="text-emerald-500 w-4">✓</span>
              <span className="text-slate-600 flex-grow">{log.msg}</span>
              <span className="text-slate-300 text-[10px]">{log.pct}%</span>
            </motion.div>
          ))}
          {streamLog.length === 0 && (
            <div className="text-slate-400 text-xs text-center animate-pulse">Initializing Protocol...</div>
          )}
        </div>
        {streamLog.length > 0 && (
          <div className="mt-6 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-600 rounded-full"
              animate={{ width: `${streamLog[streamLog.length - 1]?.pct ?? 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        )}
      </div>
    </div>
  )

  if (error || !res?.metadata) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center">
      <div className="p-12 rounded-[32px] border border-slate-200 bg-white text-center shadow-xl">
        <p className="text-red-600 font-mono text-xs uppercase tracking-widest mb-4 font-bold">Node_Connection_Failed</p>
        <p className="text-slate-500 text-sm mb-8">
          {activeRegion ? `No valid matching rows found for "${activeRegion}".` : "FastAPI server is unreachable."}
        </p>
        <button
          onClick={() => { setActiveRegion(""); window.location.reload() }}
          className="px-8 py-3 bg-slate-900 text-white rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-slate-800 transition"
        >
          {activeRegion ? "Clear Slicer & Retry" : "Retry Sequence"}
        </button>
      </div>
    </div>
  )

  const stats = res.audit?.stats
  const flags = res.audit?.flags ?? []
  const primaryMetric = resolvedMetric !== "N/A" ? resolvedMetric : (res.audit?.stats?.analyzed_field ?? "N/A")
  const isDataCorrupted = (stats?.average === 0 || !stats?.average) && (stats?.data_points ?? 0) > 0

  return (
    <main className="min-h-screen bg-[#f1f5f9] text-slate-900 font-sans selection:bg-blue-100 pb-20">

      {/* NAV */}
      <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 lg:px-12 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-slate-400 hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="h-4 w-[1px] bg-slate-200 hidden md:block" />
          <h1 className="text-xs font-black uppercase tracking-widest text-slate-800 truncate max-w-2xl hidden md:block">
            {res.metadata?.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline-block">Node_Status:</span>
          {isDataCorrupted ? (
            <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black rounded-full border border-amber-200 shadow-sm">DATA_ENCODING_WARNING</span>
          ) : (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full border border-emerald-100 shadow-sm">LIVE_AUDIT_ACTIVE</span>
          )}
        </div>
      </nav>

      {/* ── REGION SLICER BAR (no fixed search, just the slicer input) ── */}
      <div className="bg-slate-900 border-b border-slate-700 px-6 lg:px-12 py-3 flex flex-wrap items-center gap-4 relative z-40 shadow-md">
        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Region Slicer
        </span>
        <div className="flex gap-2 flex-grow max-w-sm">
          <input
            type="text"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setActiveRegion(regionFilter)}
            placeholder="Filter by Ward, District, Pincode..."
            className="flex-grow bg-slate-800 border border-slate-700 text-xs text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
          />
          <button
            onClick={() => setActiveRegion(regionFilter)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm"
          >
            Slice
          </button>
          {activeRegion && (
            <button
              onClick={() => { setRegionFilter(""); setActiveRegion("") }}
              className="text-slate-400 hover:text-white px-2 text-xs"
            >✕</button>
          )}
        </div>
        {activeRegion && (
          <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/30">
            Active: {activeRegion.toUpperCase()}
          </span>
        )}
      </div>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-120px)] mt-6">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="lg:col-span-8 p-6 lg:p-12 space-y-10 border-r border-slate-200 bg-white/50">

          {/* INTELLIGENCE TABS */}
          <section className="bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl">
            <div className="flex border-b border-slate-700/50">
              {([
                { key: "ai", label: "AI_Analysis", color: "text-emerald-400" },
                { key: "nl", label: "Ask_The_Data", color: "text-purple-400" },
                { key: "correlate", label: "Cross_Dataset", color: "text-amber-400" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-4 text-[10px] font-mono uppercase tracking-[0.3em] transition-all ${
                    activeTab === tab.key
                      ? `${tab.color} border-b-2 border-current bg-slate-800/50`
                      : "text-slate-500 hover:text-slate-400"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-8 relative">
              <div className="absolute top-4 right-8 flex gap-2 pointer-events-none">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60 animate-pulse" />
              </div>

              <AnimatePresence mode="wait">

                {/* TAB: AI ANALYSIS */}
                {activeTab === "ai" && (
                  <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center gap-3 mb-6">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M4 15h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1z" />
                      </svg>
                      <h3 className="text-[10px] font-mono text-emerald-400 uppercase tracking-[0.4em]">AI_Inference_Terminal</h3>
                      <span className="ml-auto text-[9px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">llama-3.1-8b</span>
                    </div>
                    {isDataCorrupted && (
                      <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-mono leading-relaxed">
                        SYSTEM ALERT: Raw node data contains unstructured artifacts or regional font encodings.<br />
                        The Extraction Engine preserved the rows, but complex statistical variance mapping is limited.
                      </div>
                    )}
                    <p className="text-slate-300 font-mono text-sm leading-relaxed whitespace-pre-wrap min-h-[80px]">
                      {aiLoading ? (
                        <span className="text-slate-500 animate-pulse">Querying Groq inference engine...</span>
                      ) : (
                        <>
                          {aiText}
                          {!aiDone && <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse align-middle" />}
                        </>
                      )}
                    </p>
                  </motion.div>
                )}

                {/* TAB: NL QUERY */}
                {activeTab === "nl" && (
                  <motion.div key="nl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center gap-3 mb-6">
                      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-[10px] font-mono text-purple-400 uppercase tracking-[0.4em]">Natural_Language_Query</h3>
                      <span className="ml-auto text-[9px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">groq → pandas → answer</span>
                    </div>
                    <div className="flex gap-3 mb-4">
                      <input
                        ref={nlInputRef}
                        type="text"
                        value={nlQuestion}
                        onChange={(e) => setNlQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                        placeholder="Which record has the highest value?"
                        className="flex-grow bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        onClick={() => askQuestion()}
                        disabled={nlLoading}
                        className="bg-purple-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 disabled:opacity-40 transition"
                      >
                        {nlLoading ? "..." : "Ask →"}
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap mb-5">
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => askQuestion(q)}
                          className="text-[10px] px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 hover:border-purple-500 hover:text-purple-400 transition"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <AnimatePresence>
                      {nlResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`p-5 rounded-2xl border ${
                            nlResult.status === "success"
                              ? "bg-purple-900/30 border-purple-700/50"
                              : "bg-red-900/20 border-red-700/40"
                          }`}
                        >
                          {nlResult.status === "success" ? (
                            <>
                              <p className="text-[10px] font-mono text-purple-400 mb-2 uppercase tracking-widest">Result</p>
                              <p className="text-white font-black text-lg mb-1">
                                {nlResult.result_type === "value"
                                  ? String(nlResult.result)
                                  : nlResult.result_type === "table"
                                  ? `${Array.isArray(nlResult.result) ? nlResult.result.length : 0} records`
                                  : JSON.stringify(nlResult.result).slice(0, 120)}
                              </p>
                              <p className="text-slate-300 text-sm italic">{nlResult.explanation}</p>
                              <p className="text-slate-600 text-[10px] font-mono mt-3 truncate">{nlResult.pandas_expr}</p>
                            </>
                          ) : (
                            <p className="text-red-400 text-sm">{nlResult.message}</p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {nlHistory.length > 1 && (
                      <div className="mt-5 space-y-2">
                        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Previous queries</p>
                        {nlHistory.slice(1).map((h, i) => (
                          <div key={i} className="flex items-start gap-3 text-xs text-slate-500">
                            <span className="text-slate-700 shrink-0">Q:</span>
                            <span className="italic">{h.question}</span>
                            <span className="ml-auto shrink-0 text-slate-600">{h.explanation?.slice(0, 40)}...</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* TAB: CROSS-DATASET CORRELATION */}
                {activeTab === "correlate" && (
                  <motion.div key="correlate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      <h3 className="text-[10px] font-mono text-amber-400 uppercase tracking-[0.4em]">Cross_Dataset_Correlation</h3>
                      <span className="ml-auto text-[9px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        {catalogDatasets.length > 0 ? `${catalogDatasets.length} datasets loaded` : "loading catalog..."}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 mb-5">
                      {/* Step 1: Pick from dropdown OR type ID manually */}
                      {catalogDatasets.filter(d => String(d.id) !== id).length > 0 ? (
                        <div>
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Step 1 — Select dataset to compare</p>
                          <select
                            value={correlateId}
                            onChange={(e) => setCorrelateId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                          >
                            <option value="">Choose a dataset...</option>
                            {catalogDatasets
                              .filter((d) => String(d.id) !== id)
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  [{d.id}] {d.title?.slice(0, 55)}
                                </option>
                              ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Step 1 — Enter dataset ID to compare</p>
                          <input
                            type="text"
                            value={correlateId}
                            onChange={(e) => setCorrelateId(e.target.value)}
                            placeholder="Enter the numeric ID of any other dataset (e.g. 243)"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                          />
                          <p className="text-[9px] text-slate-600 mt-1 font-mono">
                            Find IDs in the URL when browsing other datasets: /dataset/[ID]
                          </p>
                        </div>
                      )}

                      {/* Step 2: Optional question */}
                      <div>
                        <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Step 2 — Ask a question (optional)</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={correlateQuery}
                            onChange={(e) => setCorrelateQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && correlateId && runCorrelation()}
                            placeholder="e.g. Which wards appear in both datasets as outliers?"
                            className="flex-grow bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                          />
                          <button
                            onClick={runCorrelation}
                            disabled={!correlateId.trim() || correlateLoading}
                            className="bg-amber-500 text-slate-900 font-black px-6 py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-900/30"
                          >
                            {correlateLoading ? (
                              <span className="flex items-center gap-2">
                                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Running
                              </span>
                            ) : "Analyze →"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Hint when no ID selected */}
                    {!correlateId && !correlateResult && (
                      <p className="text-[10px] font-mono text-slate-600 text-center py-4 border border-slate-700/50 rounded-xl bg-slate-800/30">
                        Select or enter a dataset ID above, then hit Analyze →
                      </p>
                    )}

                    <AnimatePresence>
                      {correlateResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-5 rounded-2xl border mt-2 ${
                            correlateResult.status === "success"
                              ? "bg-amber-900/20 border-amber-700/40"
                              : "bg-red-900/20 border-red-700/40"
                          }`}
                        >
                          {correlateResult.status === "success" ? (
                            <>
                              {correlateResult.dataset_a && (
                                <div className="flex gap-2 mb-4 flex-wrap">
                                  <span className="text-[9px] bg-slate-700 text-slate-300 px-2 py-1 rounded font-mono">A: {correlateResult.dataset_a?.slice(0, 30)}</span>
                                  <span className="text-[9px] text-slate-500 self-center">↔</span>
                                  <span className="text-[9px] bg-slate-700 text-slate-300 px-2 py-1 rounded font-mono">B: {correlateResult.dataset_b?.slice(0, 30)}</span>
                                </div>
                              )}
                              {correlateResult.shared_anomaly_entities?.length > 0 && (
                                <div className="p-3 bg-red-900/30 border border-red-700/40 rounded-xl mb-4">
                                  <p className="text-[10px] font-mono text-red-400 mb-1 uppercase tracking-widest">⚠ Shared anomaly entities</p>
                                  <p className="text-red-300 text-sm font-black">
                                    {correlateResult.shared_anomaly_entities.join(", ")}
                                  </p>
                                  <p className="text-red-400 text-xs mt-1">These entities appear as outliers in BOTH datasets.</p>
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] font-mono text-amber-400 mb-2 uppercase tracking-widest">AI Synthesis</p>
                                <p className="text-slate-300 text-sm leading-relaxed">{correlateResult.correlation_analysis}</p>
                              </div>
                            </>
                          ) : (
                            <div>
                              <p className="text-[10px] font-mono text-red-400 mb-2 uppercase tracking-widest">Analysis Failed</p>
                              <p className="text-red-400 text-sm">{correlateResult.correlation_analysis || "Could not analyze. Check that the dataset ID exists."}</p>
                              <p className="text-slate-600 text-[10px] font-mono mt-2">Tip: Make sure both dataset IDs exist in your catalog.</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </section>

          {/* VIZ LAB */}
          <section className="bg-white border border-slate-200 rounded-[32px] p-8 lg:p-10 shadow-sm relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-6">
              <div>
                <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.4em] mb-1 flex items-center gap-2">
                  Master_Visual_Lab
                  {isDataCorrupted && (
                    <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-md font-bold tracking-tighter">
                      ENCODING WARNING
                    </span>
                  )}
                </h3>
                <p className="text-slate-400 text-xs font-medium italic">
                  Metric: <span className="text-blue-500 font-bold">{primaryMetric}</span>
                  {stats?.average ? ` · Avg: ${Math.round(stats.average).toLocaleString()}` : ""}
                  {stats?.data_points ? ` · ${stats.data_points.toLocaleString()} records` : ""}
                </p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                {(["bar", "line", "area", "pie"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setVizType(type)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                      vizType === type ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-[380px] flex flex-col items-center justify-center text-slate-400 gap-3">
                <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-xs font-mono uppercase tracking-widest">No numeric metric columns detected</p>
                <p className="text-[10px] text-slate-300">This dataset may be categorical only</p>
              </div>
            ) : (
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {vizType === "bar" ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), primaryMetric]} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#2563eb">
                        {chartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={flags.some(f => f.entity === entry.fullName) ? "#ef4444" : "#2563eb"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : vizType === "line" ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), primaryMetric]} />
                      <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={4} dot={{ fill: "#2563eb", r: 4 }} />
                    </LineChart>
                  ) : vizType === "pie" ? (
                    <PieChart>
                      <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), primaryMetric]} />
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={140} fill="#2563eb">
                        {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  ) : (
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), primaryMetric]} />
                      <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#bfdbfe" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {flags.length > 0 && chartData.length > 0 && (
              <p className="text-[10px] text-center text-slate-400 mt-4 font-mono">
                <span className="inline-block w-2 h-2 bg-red-400 rounded-sm mr-1" />
                Red bars = anomaly entities ({flags.length} detected)
              </p>
            )}
          </section>

          {/* GEO MAP */}
          {geoMapData && (
            <section className="bg-white border border-slate-200 rounded-[32px] p-8 lg:p-10 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                <div>
                  <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.35em] mb-2">Geo_Location_Map</h3>
                  <p className="text-slate-400 text-xs font-medium italic">
                    Columns: {geoMapData.latKey} × {geoMapData.lngKey}
                    {resolvedMetric !== "N/A" && ` · Metric: ${resolvedMetric}`}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                  {geoMapData.points.length} points
                </span>
              </div>
              <StopsMap points={geoMapData.points} />
              <p className="text-[10px] text-center text-slate-400 mt-4 font-mono">
                Showing up to 250 points. Hover markers for details.
              </p>
            </section>
          )}

          {/* DATA TABLE */}
          <section className="bg-white border border-slate-200 rounded-[32px] p-8 lg:p-10 shadow-sm overflow-x-auto">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">Raw_Evidence_Stream</h3>
            <table className="w-full text-left text-xs font-bold">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 uppercase tracking-tighter">
                  {res.data[0] && Object.keys(res.data[0]).slice(0, 5).map(k => (
                    <th key={k} className={`pb-4 px-4 whitespace-nowrap ${k === primaryMetric ? "text-blue-600" : ""}`}>
                      {k}{k === primaryMetric ? " ★" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {res.data.slice(0, 10).map((row: any, i: number) => {
                  const isAnomaly = flags.some((f) => Object.values(row).includes(f.entity))
                  return (
                    <tr key={i} className={`hover:bg-slate-50 transition-all ${isAnomaly ? "bg-red-50/50" : ""}`}>
                      {Object.values(row).slice(0, 5).map((v: any, j: number) => {
                        const isRegional = String(v).includes("Regional/Unstructured")
                        const colKey = Object.keys(row)[j]
                        return (
                          <td key={j} className={`py-4 px-4 truncate max-w-[180px] ${colKey === primaryMetric ? "text-blue-700 font-black" : "text-slate-600"}`}>
                            {isRegional
                              ? <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-1 rounded-md uppercase">Encoded</span>
                              : String(v ?? "—")}
                          </td>
                        )
                      })}
                      {isAnomaly && (
                        <td className="py-4 px-2">
                          <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase">Anomaly</span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <aside className="lg:col-span-4 bg-[#f8fafc] p-6 lg:p-12 space-y-8 border-l border-slate-200 h-full">
          <div className="sticky top-28 space-y-8">

            {/* SCORECARD */}
            <section className={`text-white rounded-[40px] p-10 shadow-2xl relative overflow-hidden ${isDataCorrupted ? "bg-slate-800" : "bg-blue-600 shadow-blue-200/50"}`}>
              <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-8 opacity-60">Audit_Scorecard</h3>
              <p className="text-[10px] font-bold uppercase mb-1 opacity-80">
                {primaryMetric !== "N/A" ? `Avg ${primaryMetric}` : "Global Mean"}
              </p>
              <p className="text-5xl font-black leading-none tracking-tighter mb-8">
                {isDataCorrupted ? "ERR" : Math.round(stats?.average ?? 0).toLocaleString()}
              </p>
              <div className="pt-6 border-t border-white/20 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold opacity-60 uppercase mb-1">Records</p>
                  <p className="text-2xl font-black">{(stats?.data_points ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold opacity-60 uppercase mb-1">Anomalies</p>
                  <p className={`text-2xl font-black ${isDataCorrupted ? "text-amber-400" : "text-blue-200"}`}>
                    {isDataCorrupted ? "N/A" : flags.length}
                  </p>
                </div>
              </div>
              {!isDataCorrupted && stats?.max_value ? (
                <div className="pt-4 border-t border-white/10 mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-bold opacity-60 uppercase mb-1">Max</p>
                    <p className="text-lg font-black opacity-90">{Math.round(stats.max_value).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold opacity-60 uppercase mb-1">Std Dev</p>
                    <p className="text-lg font-black opacity-90">{Math.round(stats.std_dev ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              ) : null}
            </section>

            {/* ANOMALY LIST */}
            <section className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
              <h3 className={`text-[11px] font-black uppercase tracking-[0.3em] mb-6 flex items-center gap-2 ${isDataCorrupted ? "text-amber-600" : "text-red-600"}`}>
                <span className={`h-2 w-2 rounded-full animate-pulse ${isDataCorrupted ? "bg-amber-600" : "bg-red-600"}`} />
                {isDataCorrupted ? "Encoding_Warning" : "Anomaly_Protocol"}
              </h3>
              <div className="space-y-3">
                {isDataCorrupted ? (
                  <p className="text-amber-600 font-mono text-[10px] uppercase text-center py-6">Math suspended due to file structure.</p>
                ) : flags.length > 0 ? flags.slice(0, 3).map((f: any, i: number) => (
                  <div key={i} className="p-4 rounded-2xl bg-red-50 border border-red-100">
                    <p className="text-[10px] font-black text-red-600 uppercase mb-1">{f.entity}</p>
                    <p className="text-xs text-slate-700 italic">"{f.message}"</p>
                  </div>
                )) : (
                  <p className="text-slate-400 font-mono text-[10px] uppercase text-center py-6">No deviations found</p>
                )}
              </div>
            </section>

            {/* SAVE REPORT */}
            <div className="space-y-3">
              <button
                onClick={saveReport}
                disabled={reportSaving}
                className="w-full bg-slate-900 text-white rounded-[28px] p-7 flex flex-col items-center justify-center hover:bg-blue-600 transition-all group shadow-xl active:scale-95 disabled:opacity-60"
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.4em] mb-2 group-hover:text-blue-100 text-slate-400">
                  Transparency Act 4.3
                </span>
                <span className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  {reportSaving ? "Saving..." : "Share Report"}
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>

              {reportUrl && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <p className="text-[10px] text-emerald-600 font-mono mb-2 uppercase tracking-widest">Report saved — shareable link:</p>
                  <div className="flex gap-2">
                    <input readOnly value={reportUrl} className="flex-grow text-xs bg-white border border-emerald-200 rounded-xl px-3 py-2 text-emerald-800 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(reportUrl)} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-500 transition">
                      Copy
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <footer className="pt-2 flex flex-col gap-1 text-[9px] text-slate-400 font-bold uppercase tracking-[0.4em] text-center">
              <div>Protocol_v5.0_Deployed</div>
              <div>Node: BLR_REGISTRY_0x{id}</div>
            </footer>
          </div>
        </aside>
      </div>
    </main>
  )
}