"use client"

import { use, useEffect, useState, useMemo, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"

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

const API = "http://127.0.0.1:8000"

// ─── SUGGESTED QUESTIONS ─────────────────────────────────────────────────────
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
  const { id } = use(params)

  // Core data state
  const [res, setRes] = useState<APIResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [streamLog, setStreamLog] = useState<StreamLog[]>([])

  // UI state
  const [vizType, setVizType] = useState<"bar" | "line" | "area">("bar")
  const [activeTab, setActiveTab] = useState<"ai" | "nl" | "correlate">("ai")

  // AI terminal
  const [aiText, setAiText] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDone, setAiDone] = useState(false)

  // NL Query
  const [nlQuestion, setNlQuestion] = useState("")
  const [nlResult, setNlResult] = useState<NLResult | null>(null)
  const [nlLoading, setNlLoading] = useState(false)
  const [nlHistory, setNlHistory] = useState<NLResult[]>([])

  // Correlate
  const [correlateId, setCorrelateId] = useState("")
  const [correlateResult, setCorrelateResult] = useState<any>(null)
  const [correlateLoading, setCorrelateLoading] = useState(false)
  const [catalogDatasets, setCatalogDatasets] = useState<any[]>([])

  // Report
  const [reportSaving, setReportSaving] = useState(false)
  const [reportUrl, setReportUrl] = useState("")

  const nlInputRef = useRef<HTMLInputElement>(null)

  // ── STREAMING JIT FETCH ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(false)
    setStreamLog([])

    const es = new EventSource(`${API}/api/jit-stream/${id}`)

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.done) {
        setRes(data.payload)
        setLoading(false)
        es.close()
      } else if (data.error) {
        console.error("Stream error:", data.error)
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
  }, [id])

  // ── FETCH CATALOG FOR CORRELATION DROPDOWN ────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "BBMP" }),
    })
      .then((r) => r.json())
      .then((d) => setCatalogDatasets(d.datasets || []))
      .catch(() => {})
  }, [])

  // ── REAL GROQ AI ANALYSIS ─────────────────────────────────────────────────
  useEffect(() => {
    if (!res || loading) return
    setAiLoading(true)
    setAiText("")
    setAiDone(false)

    fetch(`${API}/api/ai-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: res.metadata?.title ?? "Unknown Dataset",
        stats: res.audit?.stats ?? {},
        flags: res.audit?.flags ?? [],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const text: string = data.analysis ?? "Analysis unavailable."
        setAiLoading(false)
        let i = 0
        const interval = setInterval(() => {
          setAiText(text.slice(0, i))
          i++
          if (i > text.length) { clearInterval(interval); setAiDone(true) }
        }, 16)
        return () => clearInterval(interval)
      })
      .catch(() => {
        setAiLoading(false)
        setAiText("AI analysis unavailable. Check GROQ_API_KEY.")
        setAiDone(true)
      })
  }, [res, loading])

  // ── CHART DATA ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!res?.data || !Array.isArray(res.data)) return []
    const primaryMetric = res.audit?.stats?.analyzed_field

    return res.data.slice(0, 15).map((row) => {
      const keys = Object.keys(row)
      const labelKey = keys.find((k) =>
        ["name", "ward", "year", "district", "location", "state", "city"].some((s) => k.toLowerCase().includes(s))
      ) ?? keys[0]
      const valueKey = (primaryMetric && row[primaryMetric] !== undefined)
        ? primaryMetric
        : (keys.find((k) => typeof row[k] === "number") ?? keys[1])

      return {
        name: row[labelKey]?.toString().substring(0, 14) ?? "N/A",
        value: Number(row[valueKey]) || 0,
        fullName: row[labelKey],
      }
    })
  }, [res])

  // ── NL QUERY HANDLER ──────────────────────────────────────────────────────
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

  // ── CORRELATION HANDLER ───────────────────────────────────────────────────
  const runCorrelation = async () => {
    if (!correlateId) return
    setCorrelateLoading(true)
    setCorrelateResult(null)

    try {
      const r = await fetch(`${API}/api/correlate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id_a: id, dataset_id_b: correlateId }),
      })
      const data = await r.json()
      setCorrelateResult(data)
    } catch {
      setCorrelateResult({ status: "error" })
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
      // fallback to local download
      const report = { dataset: res?.metadata?.title, analyzed_at: new Date().toISOString(), stats: res?.audit?.stats, anomalies: res?.audit?.flags, ai_analysis: aiText }
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `civic-audit-${id}.json`; a.click()
    } finally {
      setReportSaving(false)
    }
  }

  // ─── LOADING — LIVE STREAM PROGRESS ──────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center font-mono px-8">
      <div className="w-full max-w-sm">
        <p className="text-blue-600 text-[10px] mb-8 animate-pulse uppercase tracking-[0.5em] font-bold text-center">
          Live_Data_Acquisition
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
            <div className="text-slate-400 text-xs text-center animate-pulse">Initializing...</div>
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
        <p className="text-slate-500 text-sm mb-8">FastAPI server is unreachable. Ensure it's running on port 8000.</p>
        <button onClick={() => window.location.reload()} className="px-8 py-3 bg-slate-900 text-white rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-slate-800 transition">
          Retry
        </button>
      </div>
    </div>
  )

  const stats = res.audit?.stats
  const flags = res.audit?.flags ?? []
  const primaryMetric = res.audit?.stats?.analyzed_field ?? "N/A"

  return (
    <main className="min-h-screen bg-[#f1f5f9] text-slate-900 font-sans selection:bg-blue-100">

      {/* NAV */}
      <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 lg:px-12 py-5 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-slate-400 hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="h-4 w-[1px] bg-slate-200 hidden md:block" />
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-800 truncate max-w-xl hidden md:block">
            {res.metadata?.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline-block">Node_Status:</span>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full border border-emerald-100">LIVE_AUDIT_ACTIVE</span>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-72px)]">

        {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
        <div className="lg:col-span-8 p-6 lg:p-12 space-y-10 border-r border-slate-200 bg-white/50">

          {/* INTELLIGENCE TAB SWITCHER */}
          <section className="bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl">
            {/* Tab bar */}
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

            <div className="p-8">
              {/* macOS dots */}
              <div className="absolute top-[72px] right-8 flex gap-2 pointer-events-none">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60 animate-pulse" />
              </div>

              {/* TAB: AI ANALYSIS */}
              <AnimatePresence mode="wait">
                {activeTab === "ai" && (
                  <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center gap-3 mb-6">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M4 15h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1z" />
                      </svg>
                      <h3 className="text-[10px] font-mono text-emerald-400 uppercase tracking-[0.4em]">AI_Inference_Terminal</h3>
                      <span className="ml-auto text-[9px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        llama-3.1-8b · groq
                      </span>
                    </div>
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
                      <span className="ml-auto text-[9px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        groq → pandas → answer
                      </span>
                    </div>

                    <div className="flex gap-3 mb-4">
                      <input
                        ref={nlInputRef}
                        type="text"
                        value={nlQuestion}
                        onChange={(e) => setNlQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                        placeholder="Which ward has the highest value? What is the average?"
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

                    {/* Suggested questions */}
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

                    {/* Result */}
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

                    {/* History */}
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
                    <div className="flex items-center gap-3 mb-6">
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      <h3 className="text-[10px] font-mono text-amber-400 uppercase tracking-[0.4em]">Cross_Dataset_Correlation</h3>
                    </div>

                    <p className="text-slate-400 text-xs mb-5 font-medium">
                      Select a second dataset to compare with "{res.metadata?.title?.slice(0, 40)}..."
                    </p>

                    <div className="flex gap-3 mb-5">
                      <select
                        value={correlateId}
                        onChange={(e) => setCorrelateId(e.target.value)}
                        className="flex-grow bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select second dataset...</option>
                        {catalogDatasets
                          .filter((d) => String(d.id) !== id)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title?.slice(0, 60)}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={runCorrelation}
                        disabled={!correlateId || correlateLoading}
                        className="bg-amber-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 disabled:opacity-40 transition"
                      >
                        {correlateLoading ? "Analyzing..." : "Correlate →"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {correlateResult && correlateResult.status === "success" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-5 rounded-2xl bg-amber-900/20 border border-amber-700/40 space-y-4"
                        >
                          {correlateResult.shared_anomaly_entities?.length > 0 && (
                            <div className="p-3 bg-red-900/30 border border-red-700/40 rounded-xl">
                              <p className="text-[10px] font-mono text-red-400 mb-1 uppercase tracking-widest">Shared anomaly entities</p>
                              <p className="text-red-300 text-sm font-black">
                                {correlateResult.shared_anomaly_entities.join(", ")}
                              </p>
                              <p className="text-red-400 text-xs mt-1">These entities appear as outliers in BOTH datasets — high priority for investigation.</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] font-mono text-amber-400 mb-2 uppercase tracking-widest">AI correlation analysis</p>
                            <p className="text-slate-300 text-sm leading-relaxed">{correlateResult.correlation_analysis}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 bg-slate-800/50 rounded-xl">
                              <p className="text-slate-500 mb-1">Dataset A</p>
                              <p className="text-slate-300 font-bold truncate">{correlateResult.dataset_a}</p>
                              <p className="text-slate-500 mt-1">{correlateResult.summary_a?.rows?.toLocaleString()} rows</p>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-xl">
                              <p className="text-slate-500 mb-1">Dataset B</p>
                              <p className="text-slate-300 font-bold truncate">{correlateResult.dataset_b}</p>
                              <p className="text-slate-500 mt-1">{correlateResult.summary_b?.rows?.toLocaleString()} rows</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* VIZ LAB */}
          <section className="bg-white border border-slate-200 rounded-[32px] p-8 lg:p-10 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
              <div>
                <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.4em] mb-2">Multi-Modal_Viz_Lab</h3>
                <p className="text-slate-400 text-xs font-medium italic">Metric: {primaryMetric}</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                {(["bar", "line", "area"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setVizType(type)}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      vizType === type ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {vizType === "bar" ? (
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }} itemStyle={{ color: "#2563eb", fontWeight: "bold" }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={36}>
                      {chartData.map((_: any, i: number) => (
                        <Cell key={i} fill={
                          flags.some((f) => f.entity === chartData[i]?.fullName) ? "#ef4444" : i === 0 ? "#2563eb" : "#cbd5e1"
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                ) : vizType === "line" ? (
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }} itemStyle={{ color: "#2563eb", fontWeight: "bold" }} />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={4} dot={{ r: 5, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 8 }} />
                  </LineChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }} itemStyle={{ color: "#2563eb", fontWeight: "bold" }} />
                    <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Anomaly bar highlight legend */}
            {flags.length > 0 && (
              <p className="text-[10px] text-center text-slate-400 mt-4 font-mono">
                <span className="inline-block w-2 h-2 bg-red-400 rounded-sm mr-1" />
                Red bars = anomaly entities ({flags.length} detected)
              </p>
            )}
          </section>

          {/* DATA TABLE */}
          <section className="bg-white border border-slate-200 rounded-[32px] p-8 lg:p-10 shadow-sm overflow-hidden">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8 text-center">Dataset_Evidence_Stream</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-bold">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100 uppercase tracking-tighter">
                    {res.data?.[0] && Object.keys(res.data[0]).slice(0, 5).map((k) => (
                      <th key={k} className="pb-5 px-4 whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {res.data?.slice(0, 10).map((row, i) => {
                    const isAnomaly = flags.some((f) => Object.values(row).includes(f.entity))
                    return (
                      <tr key={i} className={`hover:bg-slate-50 transition-all group ${isAnomaly ? "bg-red-50/50" : ""}`}>
                        {Object.values(row).slice(0, 5).map((v: any, j) => (
                          <td key={j} className={`py-4 px-4 transition-colors truncate max-w-[180px] ${isAnomaly ? "text-red-600" : "text-slate-600 group-hover:text-blue-600"}`}>
                            {String(v ?? "—")}
                          </td>
                        ))}
                        {isAnomaly && <td className="py-4 px-2"><span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase">Anomaly</span></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <aside className="lg:col-span-4 bg-[#f8fafc] p-6 lg:p-12 space-y-6 h-full">
          <div className="sticky top-32 space-y-6">

            {/* SCORECARD */}
            <section className="bg-blue-600 text-white rounded-[40px] p-10 shadow-2xl shadow-blue-200/50 relative overflow-hidden">
              <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-8 opacity-60 italic">Audit_Scorecard</h3>
              <p className="text-[10px] font-bold uppercase mb-1 opacity-80 tracking-widest">Global Node Mean</p>
              <p className="text-5xl font-black leading-none tracking-tighter mb-8">
                {Math.round(stats?.average ?? 0).toLocaleString()}
              </p>
              <div className="pt-6 border-t border-white/20 grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[9px] font-bold uppercase opacity-60 mb-1 tracking-widest">Records</p>
                  <p className="text-2xl font-black">{(stats?.data_points ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase opacity-60 mb-1 tracking-widest">Anomalies</p>
                  <p className="text-2xl font-black text-red-300">{flags.length}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase opacity-60 mb-1 tracking-widest">Std Dev</p>
                  <p className="text-lg font-black">{Math.round(stats?.std_dev ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase opacity-60 mb-1 tracking-widest">Max Value</p>
                  <p className="text-lg font-black">{Math.round(stats?.max_value ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </section>

            {/* ANOMALY LIST */}
            <section className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                <h3 className="text-[11px] font-black text-red-600 uppercase tracking-[0.3em]">Anomaly_Protocol</h3>
                {flags.length > 0 && (
                  <span className="ml-auto text-[9px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-black">
                    {flags.length} flagged
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {flags.length > 0 ? (
                  flags.slice(0, 4).map((f, i) => (
                    <motion.div
                      key={i}
                      initial={{ x: 10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.08 }}
                      className="p-4 rounded-2xl bg-red-50 border border-red-100 hover:border-red-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-wide">{f.entity}</p>
                        {f.deviation_score && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-mono">
                            σ={f.deviation_score}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 italic leading-relaxed">"{f.message}"</p>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">No deviations found</p>
                  </div>
                )}
              </div>
            </section>

            {/* METADATA */}
            <section className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Dataset_Metadata</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Source</span>
                  <a href={res.metadata?.source_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-[140px]">
                    {res.metadata?.source_url ? "data.gov.in ↗" : "Unknown"}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total sum</span>
                  <span className="font-bold text-slate-700">{(stats?.total_sum ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Min value</span>
                  <span className="font-bold text-slate-700">{(stats?.min_value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </div>
                {res.metadata?.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {res.metadata.tags.slice(0, 4).map((tag: string) => (
                      <span key={tag} className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SAVE / SHARE REPORT */}
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
                  {reportSaving ? "Saving..." : "Share Report"}{" "}
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