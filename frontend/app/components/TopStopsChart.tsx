"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts"

type Stop = {
  name: string
  trips: number
}

export default function TopStopsChart({ stops }: { stops: Stop[] }) {

  const topStops = [...stops]
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 20)

  return (
    <div className="w-full h-[400px]">

      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={topStops} layout="vertical">

          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />

          <XAxis type="number" />

          <YAxis
            dataKey="name"
            type="category"
            width={150}
          />

          <Tooltip />

          <Bar
            dataKey="trips"
            radius={[6, 6, 6, 6]}
          />

        </BarChart>
      </ResponsiveContainer>

    </div>
  )
}