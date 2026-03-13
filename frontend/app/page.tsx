// "use client"

// import { useEffect, useState } from "react"
// import Link from "next/link"

// type Dataset = {
//   id: number
//   data: any
// }

// export default function Home() {

//   const [datasets, setDatasets] = useState<Dataset[]>([])
//   const [search, setSearch] = useState("")

//   useEffect(() => {
//     fetch("http://127.0.0.1:8000/api/data/raw_tenders")
//       .then(res => res.json())
//       .then(data => setDatasets(data.data))
//   }, [])

//   const filtered = datasets.filter(d =>
//     d.data["Stop Name"]
//       ?.toLowerCase()
//       .includes(search.toLowerCase())
//   )

//   return (
//     <main className="p-10 max-w-6xl mx-auto">

//       <h1 className="text-4xl font-bold mb-8">
//         Transport Dataset Explorer
//       </h1>

//       {/* SEARCH BAR */}

//       <input
//         type="text"
//         placeholder="Search stop name..."
//         className="w-full p-4 border rounded-xl mb-10"
//         value={search}
//         onChange={(e) => setSearch(e.target.value)}
//       />

//       {/* RESULTS */}

//       <div className="grid gap-4">

//         {filtered.map((item) => (
//           <Link
//             key={item.id}
//             href={`/dataset/${item.id}`}
//             className="p-6 border rounded-xl hover:bg-gray-50"
//           >

//             <h2 className="text-xl font-semibold">
//               {item.data["Stop Name"]}
//             </h2>

//             <p className="text-gray-500">
//               Trips: {item.data["Num trips in stop"]}
//             </p>

//           </Link>
//         ))}

//       </div>

//     </main>
//   )
// }










"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Tilt from "react-parallax-tilt"

type Dataset = {
  id: number
  data: any
}

export default function Home() {

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [search, setSearch] = useState("")
  const [mouse, setMouse] = useState({x:0,y:0})

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/data/raw_tenders")
      .then(res => res.json())
      .then(data => setDatasets(data.data))
  }, [])

  const filtered = datasets.filter(d =>
    d.data["Stop Name"]
      ?.toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <main
      onMouseMove={(e)=>setMouse({x:e.clientX,y:e.clientY})}
      className="relative min-h-screen bg-[#030303] text-white overflow-hidden"
    >

      {/* CURSOR SPOTLIGHT */}

      <div
        className="pointer-events-none fixed w-[600px] h-[600px] rounded-full blur-[120px] opacity-30"
        style={{
          left:mouse.x-300,
          top:mouse.y-300,
          background:"radial-gradient(circle, rgba(120,120,255,0.5), transparent 70%)"
        }}
      />

      {/* GRADIENT MESH BACKGROUND */}

      <div className="absolute inset-0 -z-10">

        <motion.div
          animate={{x:[0,200,0],y:[0,-200,0]}}
          transition={{duration:20,repeat:Infinity}}
          className="absolute w-[700px] h-[700px] bg-purple-500/20 blur-[200px]"
        />

        <motion.div
          animate={{x:[0,-200,0],y:[0,200,0]}}
          transition={{duration:25,repeat:Infinity}}
          className="absolute right-0 w-[700px] h-[700px] bg-blue-500/20 blur-[200px]"
        />

      </div>

      <div className="max-w-7xl mx-auto px-10 py-28">

        {/* HERO */}

        <motion.h1
          initial={{opacity:0,y:40}}
          animate={{opacity:1,y:0}}
          transition={{duration:0.8}}
          className="text-[90px] leading-[0.9] font-semibold tracking-tight mb-10"
        >
          Urban
          <br/>
          Transport Data
        </motion.h1>

        {/* SEARCH */}

        <input
          placeholder="Search stop..."
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          className="
          w-full mb-20
          p-6
          text-lg
          rounded-2xl
          bg-white/[0.05]
          backdrop-blur-xl
          border border-white/10
          focus:border-white/30
          outline-none
          transition
          "
        />

        {/* MASONRY GRID */}

        <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">

          {filtered.map((item,i)=>(

            <Tilt
              key={item.id}
              glareEnable
              glareMaxOpacity={0.2}
              scale={1.04}
              className="break-inside-avoid"
            >

              <motion.div
                initial={{opacity:0,y:40}}
                animate={{opacity:1,y:0}}
                transition={{delay:i*0.03}}
              >

                <Link
                  href={`/dataset/${item.id}`}
                  className="
                  block
                  p-8
                  rounded-[28px]
                  bg-white/[0.04]
                  backdrop-blur-xl
                  border border-white/10
                  hover:border-white/30
                  transition
                  relative
                  overflow-hidden
                  "
                >

                  {/* gradient glow */}

                  <div className="absolute inset-0 opacity-0 hover:opacity-100 transition duration-500">
                    <div className="absolute -inset-20 bg-gradient-to-r from-purple-500/30 to-blue-500/30 blur-[100px]" />
                  </div>

                  <h2 className="text-2xl font-semibold relative">
                    {item.data["Stop Name"]}
                  </h2>

                  <p className="text-gray-400 mt-4 text-sm relative">
                    {item.data["Num trips in stop"]} trips
                  </p>

                </Link>

              </motion.div>

            </Tilt>

          ))}

        </div>

      </div>

    </main>
  )
}