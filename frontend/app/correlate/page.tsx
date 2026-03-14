"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"

export default function CorrelationEngine() {
  const searchParams = useSearchParams()
  const idA = searchParams.get("idA")
  const idB = searchParams.get("idB")

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idA || !idB) return;
    
    fetch("http://127.0.0.1:8000/api/correlate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id_a: idA, dataset_id_b: idB })
    })
    .then(res => res.json())
    .then(d => {
      setData(d)
      setLoading(false)
    })
    .catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [idA, idB])

  if (loading) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center font-mono">
      <div className="text-red-600 text-xs mb-4 animate-pulse uppercase tracking-[0.5em] font-bold">Cross-Referencing_Vectors</div>
      <div className="h-[2px] w-64 bg-slate-200 overflow-hidden"><motion.div className="h-full bg-red-600" animate={{ x: [-256, 256] }} transition={{ repeat: Infinity, duration: 1.2 }} /></div>
    </div>
  )

  if (!data || data.status === "error") return <div className="p-20 text-center text-red-500">Correlation failed. Ensure datasets have overlapping spatial/temporal data.</div>

  return (
    <main className="min-h-screen bg-[#f1f5f9] text-slate-900 p-8 lg:p-12 font-sans">
      
      <div className="max-w-7xl mx-auto mb-12 flex justify-between items-end border-b border-slate-200 pb-6">
        <div>
           <Link href="/" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-blue-600 mb-4 block">← Abort Investigation</Link>
           <h1 className="text-4xl font-black text-slate-900 tracking-tight">AI Correlation Audit</h1>
        </div>
        <div className="text-right">
           <span className="px-4 py-2 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-red-200">Accountability Engine Active</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
        
        {/* DATASET A */}
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
          <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-4">Vector A</p>
          <h2 className="text-xl font-bold text-blue-600 leading-snug mb-8">{data.dataset_a}</h2>
          
          <div className="space-y-6">
            <StatRow label="Analyzed Metric" value={data.summary_a.analyzed_field} />
            <StatRow label="System Average" value={data.summary_a.average.toLocaleString()} />
            <StatRow label="Max Deviation" value={data.summary_a.max_value.toLocaleString()} />
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Detected Outliers</p>
             {data.summary_a.top_anomalies.map((a: string, i: number) => (
                <p key={i} className="text-sm font-medium text-slate-700 truncate">• {a}</p>
             ))}
          </div>
        </div>

        {/* THE AI SYNTHESIS (MIDDLE) */}
        <div className="bg-slate-900 text-white rounded-[32px] p-8 shadow-2xl relative z-10 scale-105 border border-slate-700">
           <div className="flex justify-between items-center mb-8">
              <div className="flex gap-2"><div className="h-2 w-2 rounded-full bg-red-500 animate-pulse"/><div className="h-2 w-2 rounded-full bg-yellow-500"/></div>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-[0.3em]">Llama-3 Synthesis</p>
           </div>
           
           <h3 className="text-lg font-bold text-white mb-6 leading-tight">Cross-Reference Conclusion</h3>
           <p className="text-slate-300 font-medium text-sm leading-relaxed italic border-l-2 border-blue-500 pl-4">
              "{data.correlation_analysis}"
           </p>

           <div className="mt-10 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                 <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 Overlapping Anomalies
              </p>
              {data.shared_anomaly_entities.length > 0 ? (
                data.shared_anomaly_entities.map((e: string, i: number) => (
                  <span key={i} className="inline-block px-3 py-1 bg-red-500/20 text-red-300 text-xs font-bold rounded-lg mt-2 mr-2">{e}</span>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic mt-2">No direct shared geographic/entity outliers detected between these specific vectors.</p>
              )}
           </div>
        </div>

        {/* DATASET B */}
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
          <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-4">Vector B</p>
          <h2 className="text-xl font-bold text-blue-600 leading-snug mb-8">{data.dataset_b}</h2>
          
          <div className="space-y-6">
            <StatRow label="Analyzed Metric" value={data.summary_b.analyzed_field} />
            <StatRow label="System Average" value={data.summary_b.average.toLocaleString()} />
            <StatRow label="Max Deviation" value={data.summary_b.max_value.toLocaleString()} />
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Detected Outliers</p>
             {data.summary_b.top_anomalies.map((a: string, i: number) => (
                <p key={i} className="text-sm font-medium text-slate-700 truncate">• {a}</p>
             ))}
          </div>
        </div>

      </div>
    </main>
  )
}

function StatRow({label, value}: {label: string, value: string}) {
  return (
    <div className="flex justify-between items-end border-b border-slate-50 pb-2">
      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
      <span className="text-lg font-black text-slate-800">{value}</span>
    </div>
  )
}