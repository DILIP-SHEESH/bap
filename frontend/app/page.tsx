"use client"

import { useEffect, useState } from "react"
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
  const [searchStatus, setSearchStatus] = useState("idle")

  // THE KILLER PITCH: Investigator Mode States
  const [investigatorMode, setInvestigatorMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const departments = ["All", "Health", "Finance", "Infrastructure", "Transport", "Governance"]

  useEffect(() => {
    setMounted(true)
    handleSearch("") // Fetch all default data on load without hardcoding a query
  }, [])

  // THE FOOLPROOF SEARCH ENGINE
  const handleSearch = async (queryOverride?: string) => {
    const finalQuery = queryOverride !== undefined ? queryOverride : search
    setLoading(true)
    setSearchStatus("searching")
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      })
      const result = await res.json()
      
      if (result.status === "success" && result.datasets && result.datasets.length > 0) {
        setDatasets(result.datasets)
        setSearchStatus("success")
        
        // Auto-switch active tab based on backend AI logic
        if (result.suggested_dept && departments.includes(result.suggested_dept)) {
          setActiveDept(result.suggested_dept)
        }
      } else {
        setDatasets([])
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

  // Make department buttons trigger actual backend AI searches instead of local filtering
  const handleDeptClick = (dept: string) => {
    setActiveDept(dept)
    if (dept === "All") {
      setSearch("")
      handleSearch("")
    } else {
      setSearch(dept)
      handleSearch(dept)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100 pb-20">
      
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

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12">
        
        {/* 2. INSTITUTIONAL HEADER */}
        <header className="mb-12">
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
              <p className="text-xs font-bold text-slate-700 tracking-tighter uppercase bg-slate-100 px-3 py-1 rounded-md border border-slate-200 shadow-sm">Public_Researcher_Node_v5.0</p>
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
                placeholder="Query nodes (e.g. 'hospital budget', 'infrastructure defects')..."
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

        {/* 3. INVESTIGATOR MODE TOGGLE (THE WINNING PITCH) */}
        <div className="mb-10 flex items-center justify-between bg-white border border-blue-200 p-5 rounded-[20px] shadow-sm">
          <div className="flex items-center gap-5">
            <button 
              onClick={() => { setInvestigatorMode(!investigatorMode); setSelectedIds([]); }}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${investigatorMode ? 'bg-red-500' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${investigatorMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div>
              <p className={`text-xs font-black uppercase tracking-widest ${investigatorMode ? 'text-red-600' : 'text-slate-800'}`}>Investigator Mode</p>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mt-0.5">Cross-reference multiple datasets to expose anomalies.</p>
            </div>
          </div>
          
          <AnimatePresence>
            {investigatorMode && selectedIds.length > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                {selectedIds.length === 2 ? (
                  <Link href={`/correlate?idA=${selectedIds[0]}&idB=${selectedIds[1]}`} className="px-8 py-3 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-red-700 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all flex items-center gap-3">
                    <span className="h-2 w-2 bg-white rounded-full animate-ping" />
                    Launch AI Correlation
                  </Link>
                ) : (
                  <span className="px-6 py-2.5 bg-slate-100 text-slate-500 font-bold text-[10px] uppercase tracking-widest rounded-xl border border-slate-200">
                    Select 1 more dataset...
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 4. DEPARTMENT AI TRIGGERS */}
        <nav className="flex flex-wrap gap-2 mb-10 border-b border-slate-200 pb-8">
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => handleDeptClick(dept)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                activeDept === dept 
                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" 
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {dept}
            </button>
          ))}
        </nav>

        {/* 5. DATA NODES LIST */}
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {datasets.map((item, i) => {
              const isSelected = selectedIds.includes(item.id.toString());
              
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: i * 0.03 }}>
                  <div 
                    onClick={() => {
                      if (investigatorMode) {
                        if (isSelected) {
                          setSelectedIds(selectedIds.filter(id => id !== item.id.toString()))
                        } else if (selectedIds.length < 2) {
                          setSelectedIds([...selectedIds, item.id.toString()])
                        }
                      } else {
                        window.location.href = `/dataset/${item.id}`
                      }
                    }}
                    className={`cursor-pointer group flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 bg-white border rounded-[24px] transition-all duration-300 ${
                      isSelected 
                      ? "border-red-500 shadow-lg shadow-red-100 bg-red-50/20 ring-1 ring-red-500/50" 
                      : "border-slate-200 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-100"
                    }`}
                  >
                    <div className="flex-grow pr-6">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-[9px] font-black px-3 py-1 uppercase rounded-lg ${isSelected ? 'text-red-700 bg-red-100' : 'text-blue-700 bg-blue-50'}`}>
                          {item.relevance_confidence || "95%"} Match
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">REF: 0x{item.id}</span>
                      </div>
                      <h2 className={`text-xl md:text-2xl font-bold transition-colors ${isSelected ? 'text-red-600' : 'text-slate-900 group-hover:text-blue-600'}`}>
                        {item.title}
                      </h2>
                      <p className="text-sm text-slate-500 mt-2 line-clamp-1 font-medium">
                        {item.description || "Synthesizing metadata... Full interpretation ready."}
                      </p>
                    </div>
                    
                    <div className="mt-6 md:mt-0 flex items-center gap-8 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Action</p>
                        <p className={`text-xs font-black uppercase ${isSelected ? 'text-red-600' : 'text-slate-800'}`}>
                          {investigatorMode ? (isSelected ? 'Selected' : 'Select Node') : 'Analyze Data'}
                        </p>
                      </div>
                      <div className={`h-12 w-12 flex items-center justify-center rounded-2xl border transition-colors duration-300 ${
                        isSelected 
                        ? 'bg-red-500 border-red-500 text-white' 
                        : 'bg-slate-50 border-slate-100 text-slate-400 group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white'
                      }`}>
                        {investigatorMode && isSelected ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          
          {/* THE FOOLPROOF EMPTY STATE */}
          {!loading && searchStatus === "empty" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-32 bg-white rounded-[32px] border border-dashed border-slate-300 shadow-sm">
              <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <p className="text-slate-900 font-bold text-lg mb-2">No civic nodes found for "{search}".</p>
              <p className="text-slate-500 font-medium text-sm">Our AI couldn't correlate your query with the current catalog. Try standard terms like "budget".</p>
              <button onClick={() => handleDeptClick("All")} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition">
                Reset Catalog
              </button>
            </motion.div>
          )}
        </div>

      </div>
    </main>
  )
}