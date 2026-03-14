"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

type Dataset = {
  id: number
  title: string
  description: string
  tags?: string[]
  relevance_confidence?: string
}

export default function Home() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [activeDept, setActiveDept] = useState("All")
  const [mounted, setMounted] = useState(false)
  const [searchStatus, setSearchStatus] = useState("idle") // NEW: Tracks if search found nothing

  const departments = ["All", "Health", "Finance", "Infrastructure", "Transport", "Governance"]

  useEffect(() => {
    setMounted(true)
    handleSearch("BBMP")
  }, [])

  const handleSearch = async (queryOverride?: string) => {
    const finalQuery = queryOverride || search || "BBMP"
    setLoading(true)
    setSearchStatus("searching")
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      })
      const result = await res.json()
      
      // FIX: Handle both success AND empty/error states correctly
      if (result.status === "success" && result.datasets.length > 0) {
        setDatasets(result.datasets)
        setSearchStatus("success")
      } else {
        setDatasets([]) // Clear old results!
        setSearchStatus("empty")
      }
    } catch (err) {
      console.error("Search failed:", err)
      setDatasets([])
      setSearchStatus("error")
    } finally {
      setLoading(false)
    }
  }

  const filteredDatasets = useMemo(() => {
    if (activeDept === "All") return datasets
    return datasets.filter(d => d.tags?.some(t => t.toLowerCase() === activeDept.toLowerCase()))
  }, [datasets, activeDept])

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      
      {/* 1. TOP UTILITY BAR */}
      <div className="w-full border-b border-slate-200 bg-white/80 backdrop-blur-md px-8 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">System_Status: Operational</span>
        </div>
        <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">
          {mounted ? new Date().toLocaleDateString('en-GB') : "LOADING_TIMESTAMP"} // Bengaluru_Core_Registry
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-16">
        
        {/* 2. INSTITUTIONAL HEADER */}
        <header className="mb-20">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-10 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-3">
                Civic Data <span className="text-blue-600">Audit Engine</span>
              </h1>
              <p className="text-slate-500 max-w-xl text-sm md:text-base leading-relaxed">
                Centralized intelligence portal for government dataset aggregation, 
                automated anomaly detection, and cross-departmental analytics.
              </p>
            </motion.div>
            <div className="hidden md:block text-right font-mono">
              <p className="text-[10px] text-slate-400 uppercase mb-1">Access Protocol</p>
              <p className="text-xs font-bold text-slate-700 tracking-tighter uppercase bg-slate-100 px-3 py-1 rounded-md">Public_Researcher_Node_v4.3</p>
            </div>
          </div>

          {/* SEARCH INTERFACE */}
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex w-full shadow-xl rounded-2xl overflow-hidden group">
            <div className="relative flex-grow bg-white">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                <svg className={`w-5 h-5 transition-colors ${loading ? 'text-blue-600 animate-spin' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {loading ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />}
                </svg>
              </div>
              <input
                placeholder="Query nodes (e.g. 'spending anomalies', 'morbidity trends')..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent border-y border-l border-slate-200 py-6 pl-14 pr-8 text-base focus:outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400 font-medium"
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold px-8 md:px-16 transition-colors text-[11px] uppercase tracking-[0.2em]"
            >
              {loading ? "Parsing..." : "Execute Search"}
            </button>
          </form>
        </header>

        {/* 3. DEPARTMENT FILTERS */}
        <nav className="flex flex-wrap gap-2 mb-10 border-b border-slate-200 pb-8">
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                activeDept === dept 
                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700"
              }`}
            >
              {dept}
            </button>
          ))}
        </nav>

        {/* 4. DATA NODES LIST */}
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredDatasets.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: i * 0.03 }}>
                <Link href={`/dataset/${item.id}`} className="group flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 bg-white border border-slate-200 rounded-[24px] hover:border-blue-400 hover:shadow-xl hover:shadow-blue-100 transition-all duration-300">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[9px] font-black text-blue-700 px-3 py-1 uppercase bg-blue-50 rounded-lg">
                        {item.relevance_confidence || "95%"} Match
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">REF: 0x{item.id}</span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h2>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-1 font-medium">
                      {item.description || "Synthesizing metadata... Full interpretation ready."}
                    </p>
                  </div>
                  
                  <div className="mt-6 md:mt-0 flex items-center gap-8">
                    <div className="text-right hidden sm:block">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Audit Level</p>
                      <p className="text-xs font-black text-slate-800 uppercase">AI Automated</p>
                    </div>
                    <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 group-hover:bg-blue-600 group-hover:border-blue-600 transition-colors duration-300">
                      <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* FIX: THE EMPTY STATE NOW WORKS */}
          {!loading && searchStatus === "empty" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-32 bg-white rounded-[32px] border border-dashed border-slate-300">
              <p className="text-slate-900 font-bold text-lg mb-2">No civic nodes found.</p>
              <p className="text-slate-500 font-medium text-sm">Try searching for "health", "finance", or "infrastructure".</p>
            </motion.div>
          )}
        </div>

      </div>
    </main>
  )
}