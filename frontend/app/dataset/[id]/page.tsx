"use client"

import { use, useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from "recharts"

export default function DatasetAuditNode({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [res, setRes] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Inside DatasetAuditNode component
useEffect(() => {
  setLoading(true)
  setError(false) // Reset error state on new fetch

  fetch(`http://127.0.0.1:8000/api/jit-fetch/${id}`)
    .then((r) => {
      if (!r.ok) throw new Error("Backend Node Unreachable")
      return r.json()
    })
    .then((data) => {
      setRes(data)
      setLoading(false)
    })
    .catch((err) => {
      console.error("Fetch failed:", err)
      setError(true)
      setLoading(false)
    })
}, [id])

// Guard for when the backend is literally not responding
if (error) return (
  <div className="min-h-screen bg-[#020205] flex flex-col items-center justify-center">
    <div className="p-8 rounded-[32px] border border-red-500/20 bg-red-500/5 text-center backdrop-blur-xl">
      <p className="text-red-500 font-mono text-xs uppercase tracking-widest mb-4 font-bold">Node_Connection_Failed</p>
      <p className="text-white/60 text-sm mb-8">FastAPI server is currently unreachable. <br/> Run 'uvicorn app.main:app' in your backend terminal.</p>
      <button 
        onClick={() => window.location.reload()} 
        className="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-white/10 transition"
      >
        Retry_Connection
      </button>
    </div>
  </div>
)

  // --- AUTO-VISUALIZATION ENGINE ---
  const chartData = useMemo(() => {
    if (!res?.data || !Array.isArray(res.data)) return []
    
    // Take top 12 rows for the visual lab
    return res.data.slice(0, 12).map((row: any) => {
      const keys = Object.keys(row)
      
      // 1. Find a label (The first column that looks like a name or year)
      const labelKey = keys.find(k => 
        k.toLowerCase().includes('name') || 
        k.toLowerCase().includes('ward') || 
        k.toLowerCase().includes('year') ||
        k.toLowerCase().includes('district')
      ) || keys[0]

      // 2. Find a value (The column the backend flagged, or the first number)
      const valueKey = res.insights?.analyzed_field || keys.find(k => typeof row[k] === 'number')
      
      return {
        name: row[labelKey]?.toString().substring(0, 12) || "N/A",
        value: Number(row[valueKey]) || 0,
        fullName: row[labelKey]
      }
    })
  }, [res])

  // GUARD 1: LOADING STATE
  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
      <div className="text-cyan-500 font-mono text-xs mb-4 animate-pulse uppercase tracking-[0.4em]">
        Parsing_Govt_Node_{id}
      </div>
      <div className="h-1 w-64 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-cyan-500"
          animate={{ x: [-256, 256] }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        />
      </div>
    </div>
  )

  // GUARD 2: ERROR STATE
  if (error || !res?.metadata) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-center p-6">
      <p className="text-red-400 font-mono mb-4">CRITICAL_FETCH_FAILURE</p>
      <p className="text-white/50 text-sm max-w-xs">The JIT engine could not parse this dataset. Check the backend CSV source.</p>
      <Link href="/" className="mt-8 px-6 py-2 border border-white/10 rounded-full text-xs hover:bg-white/5 transition">
        BACK TO CATALOG
      </Link>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#050505] text-white p-6 lg:p-12 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <Link href="/" className="group flex items-center gap-2 text-white/40 text-[10px] font-mono tracking-widest hover:text-cyan-500 transition">
              <span className="group-hover:-translate-x-1 transition-transform">←</span> RETURN_TO_CATALOG
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold mt-4 tracking-tight leading-tight">
              {res?.metadata?.title}
            </h1>
            <div className="flex flex-wrap gap-2 mt-4">
               {res?.metadata?.tags?.slice(0, 6).map((tag: string) => (
                 <span key={tag} className="text-[9px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/40 uppercase font-mono tracking-tighter">
                   {tag}
                 </span>
               ))}
            </div>
          </div>
          
          <div className="bg-white/[0.03] border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
            <p className="text-[10px] text-cyan-500 font-mono uppercase mb-1">Node Status</p>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_10px_#06b6d4]" />
              <p className="text-lg font-bold font-mono uppercase tracking-tighter">LIVE_AUDIT</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* MAIN CONTENT AREA */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* VISUAL LAB NODE */}
            <section className="bg-white/[0.02] border border-white/10 rounded-[32px] p-8 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xs font-mono text-cyan-500 uppercase tracking-[0.3em]">Node_Visual_Lab</h3>
                <span className="text-[10px] text-white/20 font-mono italic">Rendering: {res?.insights?.analyzed_field}</span>
              </div>
              
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                        dataKey="name" 
                        stroke="#444" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                        dy={10}
                    />
                    <YAxis 
                        stroke="#444" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                    />
                    <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.03)'}}
                      contentStyle={{backgroundColor: '#0a0a0a', borderRadius: '16px', border: '1px solid #222', fontSize: '12px'}}
                      itemStyle={{color: '#06b6d4'}}
                    />
                    <Bar dataKey="value">
                      {chartData.map((entry: any, index: number) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? '#06b6d4' : '#ffffff08'} 
                            stroke={index === 0 ? '#06b6d4' : '#ffffff10'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* DATA STREAM PREVIEW */}
            <section className="bg-white/[0.01] border border-white/5 rounded-[32px] p-8">
              <h3 className="text-xs font-mono text-white/30 uppercase tracking-[0.2em] mb-8 text-center">Live_Data_Stream_Preview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-light">
                  <thead>
                    <tr className="text-white/20 border-b border-white/5">
                      {res?.data?.[0] && Object.keys(res.data[0]).slice(0, 5).map(k => (
                        <th key={k} className="pb-4 font-mono font-medium uppercase tracking-tighter">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {res?.data?.slice(0, 10).map((row: any, i: number) => (
                      <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                        {Object.values(row).slice(0, 5).map((v: any, j) => (
                          <td key={j} className="py-4 text-white/50 group-hover:text-white/90 transition-colors truncate max-w-[150px]">
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* SIDEBAR ANALYTICS */}
          <div className="space-y-6">
            
            {/* AI AUDIT SUMMARY */}
            <section className="bg-cyan-500 text-black rounded-[32px] p-8 shadow-[0_30px_60px_-12px_rgba(6,182,212,0.3)]">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-50">AI_Audit_Summary</h3>
              <p className="text-2xl font-bold leading-[1.1] tracking-tight">
                Current analysis highlights <span className="italic underline decoration-1 text-black/70">{res?.insights?.analyzed_field || 'data density'}</span> as the core metric.
              </p>
              <div className="mt-8 pt-6 border-t border-black/10">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[9px] font-bold uppercase opacity-40">System Recommendation</p>
                    <p className="text-sm font-medium leading-snug mt-1">Cross-reference with annual BBMP budget allocations.</p>
                  </div>
                  <div className="text-2xl font-black opacity-20">4.3</div>
                </div>
              </div>
            </section>

            {/* ANOMALY LIST */}
            <section className="bg-white/[0.03] border border-white/10 rounded-[32px] p-8">
              <div className="flex items-center gap-2 mb-8">
                <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-xs font-mono text-red-500 uppercase tracking-widest">Anomalies_Alert</h3>
              </div>
              <div className="space-y-4">
                {res?.flags?.length > 0 ? res.flags.slice(0, 3).map((flag: any, i: number) => (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 group hover:border-red-500/30 transition-all"
                  >
                    <p className="text-[9px] font-bold text-red-500 uppercase font-mono">{flag.type}</p>
                    <p className="text-sm mt-2 text-white/80 leading-relaxed group-hover:text-white transition-colors">{flag.message}</p>
                  </motion.div>
                )) : (
                  <p className="text-white/20 text-xs font-mono italic py-4">No significant deviations detected by engine.</p>
                )}
              </div>
            </section>

            {/* QUICK STATS */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5 group hover:border-cyan-500/20 transition-all">
                  <p className="text-[9px] text-white/30 uppercase font-mono mb-2 tracking-widest">Record_Count</p>
                  <p className="text-2xl font-bold tracking-tighter">{res?.total_rows_available || 0}</p>
                </div>
                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5 group hover:border-cyan-500/20 transition-all">
                  <p className="text-[9px] text-white/30 uppercase font-mono mb-2 tracking-widest">Global_Mean</p>
                  <p className="text-2xl font-bold tracking-tighter">{Math.round(res?.insights?.average || 0).toLocaleString()}</p>
                </div>
            </div>

          </div>
        </div>

        {/* Footer info */}
        <footer className="mt-20 pt-8 border-t border-white/5 flex justify-between items-center text-[10px] text-white/20 font-mono uppercase tracking-[0.2em]">
          <div>Protocol_v4.3_Active</div>
          <div>Location_Bengaluru_In</div>
        </footer>

      </div>
    </main>
  )
}