"use client"

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts"
import type { TooltipProps } from "recharts"

type Route = {
  name: string
  trips: number
}

const COLORS = [
  "#22d3ee",
  "#38bdf8",
  "#60a5fa",
  "#34d399",
  "#2dd4bf",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6"
]

function ChartTooltip(props: TooltipProps<number, string>) {
  const { active } = props;
  
  const payload = (props as any).payload;
  if (!active || !payload?.length) {
    return null
  }

  const item = payload[0]?.payload as Route | undefined

  if (!item) {
    return null
  }

  return (
    <div className="rounded-lg border border-cyan-100/20 bg-slate-950/90 px-3 py-2 text-xs text-cyan-50 shadow-[0_14px_35px_rgba(2,6,23,0.65)] backdrop-blur-sm">
      <p className="text-cyan-100/75">{item.name}</p>
      <p className="mt-1 text-sm font-semibold">{item.trips.toLocaleString("en-IN")} trips</p>
    </div>
  )
}

export default function RouteDistributionChart({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute?: string
  onSelectRoute?: (name: string) => void
}) {
  const topRoutes = [...routes]
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 10)

  const total = topRoutes.reduce((sum, route) => sum + route.trips, 0)
  const selectedIndex = selectedRoute ? topRoutes.findIndex((route) => route.name === selectedRoute) : -1

  if (topRoutes.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        Route distribution data is unavailable.
      </div>
    )
  }

  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="h-[360px] w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={topRoutes}
              dataKey="trips"
              nameKey="name"
              innerRadius={78}
              outerRadius={132}
              paddingAngle={2}
              stroke="rgba(2,6,23,0.18)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={900}
              onClick={(_, index) => {
                const route = topRoutes[index]
                if (route && onSelectRoute) {
                  onSelectRoute(route.name)
                }
              }}
            >
              {topRoutes.map((route, index) => {
                const isSelected = selectedIndex === index

                return (
                  <Cell
                    key={index}
                    fill={COLORS[index % COLORS.length]}
                    stroke={isSelected ? "#ecfeff" : "rgba(2,6,23,0.2)"}
                    strokeWidth={isSelected ? 3 : 1.5}
                    opacity={selectedRoute && !isSelected ? 0.45 : 1}
                  />
                )
              })}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {topRoutes.map((route, index) => {
          const share = Math.round((route.trips / total) * 100)

          return (
            <button
              key={route.name}
              type="button"
              onClick={() => onSelectRoute?.(route.name)}
              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                selectedRoute === route.name
                  ? "border-cyan-200/60 bg-cyan-300/[0.14]"
                  : "border-cyan-100/10 bg-cyan-100/[0.02] hover:border-cyan-100/30 hover:bg-cyan-100/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-xs text-cyan-100">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="truncate">{route.name}</span>
                </span>
                <span>{share}%</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
