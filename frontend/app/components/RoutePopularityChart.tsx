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

type Route = {
  name: string
  trips: number
}

export default function RoutePopularityChart({ routes }: { routes: Route[] }) {

  const topRoutes = [...routes]
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 20)

  return (
    <div className="w-full h-[400px]">

      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={topRoutes} layout="vertical">

          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />

          <XAxis type="number" />

          <YAxis
            dataKey="name"
            type="category"
            width={120}
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