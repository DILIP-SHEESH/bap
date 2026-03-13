"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import Tilt from "react-parallax-tilt"

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
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const departments = ["All", "Health", "Finance", "Infrastructure", "Transport", "Governance"]

  // UNIVERSAL SEARCH HANDLER
  const handleSearch = async (queryOverride?: string) => {
    const finalQuery = queryOverride || search || "BBMP"
    setLoading(true)
    try {
      const res = await fetch("http://127.0.0.1:8000/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      })
      const result = await res.json()
      if (result.status === "success") {
        setDatasets(result.datasets)
      }
    } catch (err) {
      console.error("Search failed:", err)
    } finally {
      setLoading(false)
    }
  }

  // Initial load so the page isn't empty
  useEffect(() => {
    handleSearch("BBMP")
  }, [])

  const filteredDatasets = useMemo(() => {
    if (activeDept === "All") return datasets
    return datasets.filter(d => d.tags?.some(t => t.toLowerCase() === activeDept.toLowerCase()))
  }, [datasets, activeDept])

  return (
    <main
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
      className="relative min-h-screen bg-[#020205] text-white overflow-x-hidden font-sans selection:bg-cyan-500/30"
    >
      {/* SPOTLIGHT EFFECT */}
      <div className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{ background: `radial-gradient(600px at ${mouse.x}px ${mouse.y}px, rgba(6, 182, 212, 0.12), transparent 80%)` }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 lg:py-24">
        
        {/* --- 1. GLOBAL COMMAND STATS --- */}
        <section className="mb-20 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Live Nodes" value="284" sub="Govt Sources" />
          <StatCard label="Anomalies" value="14" color="text-red-500" sub="Flagged Today" />
          <StatCard label="Rows Indexed" value="1.2M" sub="Analyzed" />
          <StatCard label="System" value="Online" color="text-green-500" sub="v4.3 Stable" />
        </section>

        {/* --- 2. HERO SECTION --- */}
        <header className="mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-cyan-500 font-mono tracking-[0.5em] text-[10px] mb-4 uppercase opacity-70">Civic Intelligence Protocol</p>
            <h1 className="text-6xl md:text-[90px] leading-[0.85] font-black tracking-tighter mb-12">
              Urban <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400">Transparency</span>
            </h1>
          </motion.div>

          {/* SEARCH FORM */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }} 
            className="relative w-full max-w-3xl group"
          >
            <input
              placeholder="Query the city node (e.g. 'health anomalies')..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-8 text-xl rounded-[32px] bg-white/[0.03] backdrop-blur-3xl border border-white/10 focus:border-cyan-500/40 outline-none transition pr-32 shadow-2xl group-hover:bg-white/[0.05]"
            />
            <button 
              type="submit"
              className="absolute right-4 top-4 bottom-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black px-10 rounded-2xl transition-all shadow-[0_0_30px_rgba(34,211,238,0.3)] active:scale-95"
            >
              {loading ? "..." : "SEARCH"}
            </button>
          </form>
        </header>

        {/* --- 3. DEPARTMENT FILTERS --- */}
        <div className="flex flex-wrap gap-2 mb-12">
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className={`px-6 py-2 rounded-full border text-[10px] font-mono tracking-widest uppercase transition-all ${
                activeDept === dept 
                ? "bg-white text-black border-white font-bold" 
                : "border-white/10 bg-white/5 text-white/40 hover:border-white/30"
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        {/* --- 4. MASONRY RESULTS GRID --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredDatasets.map((item, i) => (
              <Tilt
                key={item.id}
                glareEnable
                glareMaxOpacity={0.1}
                scale={1.02}
              >
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/dataset/${item.id}`}
                    className="group block p-8 rounded-[40px] bg-white/[0.02] backdrop-blur-xl border border-white/5 hover:border-cyan-500/30 transition-all relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start mb-6 relative">
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-1 rounded">
                        {item.relevance_confidence || "95%"} MATCH
                      </span>
                      <span className="text-white/10 font-mono text-[10px]">NODE_{item.id}</span>
                    </div>

                    <h2 className="text-2xl font-bold relative leading-tight group-hover:text-cyan-100 transition-colors">
                      {item.title}
                    </h2>

                    <p className="text-white/40 mt-4 text-sm relative line-clamp-3 leading-relaxed italic font-light">
                      {item.description || "Dataset profiling complete. Anomaly detection ready for audit."}
                    </p>

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between relative opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-cyan-500 uppercase">Initialize Audit Node →</span>
                    </div>
                  </Link>
                </motion.div>
              </Tilt>
            ))}
          </AnimatePresence>
        </div>

        {/* EMPTY STATE */}
        {!loading && filteredDatasets.length === 0 && search && (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-[40px]">
            <p className="text-white/20 font-mono uppercase tracking-[0.3em] text-xs">No matching nodes found in civic catalog.</p>
          </div>
        )}

      </div>
    </main>
  )
}

function StatCard({ label, value, sub, color = "text-white" }: any) {
  return (
    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[32px] backdrop-blur-md">
      <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className={`text-4xl font-black tracking-tighter ${color}`}>{value}</p>
      <p className="text-[9px] text-white/20 font-mono mt-1 uppercase">{sub}</p>
    </div>
  )
}