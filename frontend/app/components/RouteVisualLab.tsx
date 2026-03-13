"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Treemap,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import type { TooltipProps } from "recharts"

type Route = {
  name: string
  trips: number
}

type Props = {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}

type TooltipPoint = {
  name?: string
  trips?: number
  value?: number
  share?: number
  rank?: number
}

const VISUAL_COLORS = [
  "#22d3ee",
  "#38bdf8",
  "#60a5fa",
  "#34d399",
  "#2dd4bf",
  "#14b8a6",
  "#0ea5e9",
  "#06b6d4",
  "#0284c7",
  "#10b981"
]

function CompactTooltip(props: TooltipProps<any, any>) {
  const { active } = props
  const payload = (props as any).payload as any[] | undefined

  if (!active || !payload || payload.length === 0) {
    return null
  }

  const item = payload[0]?.payload as TooltipPoint | undefined

  if (!item) {
    return null
  }

  const trips = typeof item.trips === "number" ? item.trips : item.value

  return (
    <div className="rounded-lg border border-cyan-100/20 bg-slate-950/90 px-3 py-2 text-xs text-cyan-50 shadow-[0_12px_30px_rgba(2,6,23,0.7)] backdrop-blur-sm">
      <p className="text-cyan-100/75">{item.name ?? "Route"}</p>
      <p className="mt-1 text-sm font-semibold">
        {(trips ?? 0).toLocaleString("en-IN")} trips
      </p>
      {typeof item.share === "number" && (
        <p className="text-cyan-100/65">{item.share}% share</p>
      )}
    </div>
  )
}

function RouteSelectorDeck({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
      return routes.slice(0, 18)
    }

    return routes.filter((route) => route.name.toLowerCase().includes(normalized)).slice(0, 18)
  }, [query, routes])

  const maxTrips = routes[0]?.trips || 1

  return (
    <article className="glass-surface relative overflow-hidden rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
      <div className="absolute inset-0 signal-matrix-grid opacity-55" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/85 to-transparent" />

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Route Command Deck</p>
          <h2 className="mt-2 text-2xl font-semibold text-cyan-50">Choose Route Channel</h2>
        </div>
        <span className="rounded-full border border-cyan-100/20 px-3 py-1 text-xs text-cyan-100/75">
          {routes.length} routes loaded
        </span>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter routes"
          className="w-full max-w-sm rounded-xl border border-cyan-100/20 bg-slate-950/45 px-4 py-2 text-sm text-cyan-50 placeholder:text-cyan-100/45 focus:border-cyan-300/60 focus:outline-none"
        />
        <p className="text-xs text-cyan-100/70">Selected: {selectedRoute || "None"}</p>
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((route, index) => {
          const isSelected = route.name === selectedRoute
          const ratio = Math.max(8, Math.round((route.trips / maxTrips) * 100))

          return (
            <button
              key={route.name}
              type="button"
              onClick={() => onSelectRoute(route.name)}
              className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition duration-300 hover:-translate-y-1 ${
                isSelected
                  ? "route-selector-active border-cyan-200/70 bg-cyan-300/[0.12]"
                  : "border-cyan-100/20 bg-white/[0.02] hover:border-cyan-200/40"
              }`}
            >
              <div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 [background:linear-gradient(120deg,rgba(34,211,238,0.16),transparent_70%)]" />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-xs tracking-[0.2em] text-cyan-100/55">#{index + 1}</span>
                <span className="text-xs text-cyan-100/70">{route.trips.toLocaleString("en-IN")}</span>
              </div>
              <p className="relative mt-2 truncate text-sm font-medium text-cyan-50">{route.name}</p>
              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-cyan-100/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-400 shadow-[0_0_14px_rgba(45,212,191,0.7)]"
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="relative mt-5 text-sm text-cyan-100/75">No routes matched your filter.</p>
      ) : null}
    </article>
  )
}

function RouteIsometricCity({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  const top = routes.slice(0, 12)
  const maxTrips = top[0]?.trips || 1

  if (!top.length) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        No route data for skyline rendering.
      </div>
    )
  }

  return (
    <div className="glass-inset overflow-x-auto rounded-2xl p-4">
      <svg viewBox={`0 0 ${top.length * 46 + 80} 290`} className="h-[310px] min-w-[620px] w-full">
        <defs>
          <linearGradient id="isoFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id="isoSide" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0.78" />
          </linearGradient>
          <linearGradient id="isoTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        <line x1="20" y1="250" x2={top.length * 46 + 55} y2="250" stroke="rgba(125,211,252,0.32)" strokeWidth="1" />

        {top.map((route, index) => {
          const x = 28 + index * 46
          const height = Math.max(26, Math.round((route.trips / maxTrips) * 190))
          const y = 250 - height
          const isSelected = route.name === selectedRoute
          const glow = isSelected ? "rgba(103,232,249,0.9)" : "rgba(56,189,248,0.55)"

          return (
            <g
              key={route.name}
              onClick={() => onSelectRoute(route.name)}
              style={{ cursor: "pointer" }}
              className="transition-transform duration-300 hover:-translate-y-1"
            >
              <polygon points={`${x + 24},${y} ${x + 33},${y - 10} ${x + 33},240 ${x + 24},250`} fill="url(#isoSide)" />
              <polygon points={`${x},${y} ${x + 9},${y - 10} ${x + 33},${y - 10} ${x + 24},${y}`} fill="url(#isoTop)" />
              <rect x={x} y={y} width="24" height={height} fill="url(#isoFront)" />

              <rect
                x={x}
                y={y}
                width="24"
                height={height}
                fill="none"
                stroke={glow}
                strokeWidth={isSelected ? 2 : 1}
                opacity={isSelected ? 1 : 0.45}
              />

              <text x={x + 12} y={266} textAnchor="middle" fill="rgba(207,250,254,0.85)" fontSize="9">
                {`#${index + 1}`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function RouteRadarPulse({ routes, selectedRoute }: { routes: Route[]; selectedRoute: string }) {
  const top = routes.slice(0, 12)
  const selectedIndex = top.findIndex((route) => route.name === selectedRoute)
  const selected = top[selectedIndex >= 0 ? selectedIndex : 0]

  if (!selected || !top.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        Not enough data for radar profile.
      </div>
    )
  }

  const max = top[0]?.trips || 1
  const min = top[top.length - 1]?.trips || 0
  const avg = top.reduce((sum, route) => sum + route.trips, 0) / top.length
  const rank = selectedIndex >= 0 ? selectedIndex + 1 : 1
  const denominator = Math.max(1, max - min)

  const radarData = [
    { metric: "Load", value: Math.round((selected.trips / max) * 100) },
    { metric: "Rank", value: Math.round(((top.length - rank + 1) / top.length) * 100) },
    { metric: "Share", value: Math.round((selected.trips / Math.max(1, top.reduce((sum, route) => sum + route.trips, 0))) * 100 * 3) },
    { metric: "Variance", value: Math.round(((selected.trips - min) / denominator) * 100) },
    { metric: "Velocity", value: Math.min(100, Math.round((selected.trips / Math.max(1, avg)) * 52)) },
    { metric: "Impact", value: Math.min(100, Math.round((selected.trips / Math.max(1, routes.reduce((sum, route) => sum + route.trips, 0))) * 700)) }
  ]

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <RadarChart data={radarData}>
          <PolarGrid stroke="rgba(125,211,252,0.22)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
          <PolarRadiusAxis axisLine={false} tick={false} domain={[0, 100]} />
          <Radar
            dataKey="value"
            stroke="#22d3ee"
            fill="url(#radarFill)"
            fillOpacity={0.55}
            dot={{ r: 3, fill: "#a5f3fc", stroke: "#22d3ee" }}
            isAnimationActive
            animationDuration={900}
          />
          <Tooltip content={<CompactTooltip />} />
          <defs>
            <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.35" />
            </linearGradient>
          </defs>
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RouteScatterNebula({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  const top = routes.slice(0, 18)
  const total = Math.max(1, top.reduce((sum, route) => sum + route.trips, 0))

  if (!top.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        Not enough route points for scatter nebula.
      </div>
    )
  }

  const data = top.map((route, index) => ({
    name: route.name,
    rank: index + 1,
    trips: route.trips,
    share: Math.round((route.trips / total) * 100),
    bubble: Math.max(60, Math.round((route.trips / top[0].trips) * 420))
  }))

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="4 6" stroke="rgba(125,211,252,0.12)" />
          <XAxis type="number" dataKey="rank" name="Rank" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
          <YAxis type="number" dataKey="trips" name="Trips" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
          <Tooltip cursor={{ strokeDasharray: "4 4" }} content={<CompactTooltip />} />
          <Scatter
            data={data}
            fill="#22d3ee"
            shape={(props) => {
              const {
                cx = 0,
                cy = 0,
                payload = { name: "", share: 0, bubble: 60 }
              } = props as {
                cx?: number
                cy?: number
                payload?: { name: string; share: number; bubble: number }
              }

              const isSelected = payload.name === selectedRoute
              const radius = Math.max(8, payload.share * 0.55)

              return (
                <g onClick={() => onSelectRoute(payload.name)} style={{ cursor: "pointer" }}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius + (isSelected ? 5 : 0)}
                    fill={isSelected ? "rgba(165,243,252,0.95)" : "rgba(34,211,238,0.72)"}
                    stroke={isSelected ? "rgba(6,182,212,1)" : "rgba(125,211,252,0.45)"}
                    strokeWidth={isSelected ? 2.2 : 1}
                  />
                  <circle cx={cx} cy={cy} r={Math.max(2.5, radius * 0.25)} fill="rgba(2,6,23,0.7)" />
                </g>
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function RouteFlowStream({
  routes,
  selectedRoute
}: {
  routes: Route[]
  selectedRoute: string
}) {
  const top = routes.slice(0, 14)
  const streamData = top.reduce<
    Array<{
      name: string
      routeName: string
      trips: number
      cumulative: number
      selectedGlow: number
    }>
  >((accumulator, route, index) => {
    const previousCumulative = accumulator[index - 1]?.cumulative ?? 0
    const cumulative = previousCumulative + route.trips

    accumulator.push({
      name: `R${index + 1}`,
      routeName: route.name,
      trips: route.trips,
      cumulative,
      selectedGlow: route.name === selectedRoute ? route.trips : 0
    })

    return accumulator
  }, [])

  if (!streamData.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        Not enough route values for stream profile.
      </div>
    )
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <AreaChart data={streamData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="routeTripsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="routeCumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(125,211,252,0.12)" />
          <XAxis dataKey="name" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
          <YAxis tick={{ fill: "#a5f3fc", fontSize: 11 }} />
          <Tooltip content={<CompactTooltip />} />
          <Area type="monotone" dataKey="cumulative" stroke="#34d399" fill="url(#routeCumulativeGradient)" strokeWidth={2.2} />
          <Area type="monotone" dataKey="trips" stroke="#22d3ee" fill="url(#routeTripsGradient)" strokeWidth={2.6} />
          <Area type="monotone" dataKey="selectedGlow" stroke="#a5f3fc" fill="rgba(165,243,252,0.38)" strokeWidth={1.3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function RoutePowerRings({
  routes,
  selectedRoute
}: {
  routes: Route[]
  selectedRoute: string
}) {
  const top = routes.slice(0, 8)
  const max = top[0]?.trips || 1

  if (!top.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] text-sm text-cyan-100/70">
        Not enough data for ring stack.
      </div>
    )
  }

  const radialData = top.map((route, index) => ({
    name: route.name,
    trips: route.trips,
    value: Math.max(12, Math.round((route.trips / max) * 100)),
    fill: VISUAL_COLORS[index % VISUAL_COLORS.length]
  }))

  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="h-[320px] w-full">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="18%" outerRadius="96%" data={radialData} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" background cornerRadius={8} />
            <Tooltip content={<CompactTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {radialData.map((route) => {
          const isSelected = route.name === selectedRoute

          return (
            <div
              key={route.name}
              className={`rounded-xl border px-3 py-2 text-xs ${
                isSelected
                  ? "border-cyan-200/50 bg-cyan-300/[0.12] text-cyan-50"
                  : "border-cyan-100/10 bg-cyan-100/[0.03] text-cyan-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: route.fill }} />
                  <span className="truncate">{route.name}</span>
                </span>
                <span>{route.value}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function resolveRouteName(input: unknown): string {
  if (!input || typeof input !== "object") {
    return ""
  }

  const directName = "name" in input ? (input as { name?: unknown }).name : undefined
  if (typeof directName === "string" && directName) {
    return directName
  }

  const payloadValue = "payload" in input ? (input as { payload?: unknown }).payload : undefined
  if (payloadValue && typeof payloadValue === "object" && "name" in payloadValue) {
    const nestedName = (payloadValue as { name?: unknown }).name
    if (typeof nestedName === "string" && nestedName) {
      return nestedName
    }
  }

  return ""
}

function PeopleFirstInsights({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  const top = routes.slice(0, 12)
  const total = Math.max(1, routes.reduce((sum, route) => sum + route.trips, 0))

  if (!top.length) {
    return null
  }

  const coverageData = top.reduce<
    Array<{
      name: string
      rank: number
      rankLabel: string
      trips: number
      share: number
      cumulative: number
    }>
  >((accumulator, route, index) => {
    const share = Math.round((route.trips / total) * 1000) / 10
    const previousCumulative = accumulator[index - 1]?.cumulative ?? 0
    const cumulative = Math.min(100, Math.round((previousCumulative + share) * 10) / 10)

    accumulator.push({
      name: route.name,
      rank: index + 1,
      rankLabel: `R${index + 1}`,
      trips: route.trips,
      share,
      cumulative
    })

    return accumulator
  }, [])

  const topShare = coverageData[0]?.share ?? 0
  const selectedTrips = routes.find((route) => route.name === selectedRoute)?.trips ?? 0
  const selectedShare = Math.round((selectedTrips / total) * 1000) / 10
  const top3Share = coverageData.slice(0, 3).reduce((sum, row) => sum + row.share, 0)
  const top5Share = coverageData.slice(0, 5).reduce((sum, row) => sum + row.share, 0)
  const routesFor80Index = coverageData.findIndex((row) => row.cumulative >= 80)
  const routesFor80 = routesFor80Index >= 0 ? routesFor80Index + 1 : coverageData.length
  const effectiveChoices = Math.round(
    (1 / routes.reduce((sum, route) => sum + (route.trips / total) ** 2, 0)) * 10
  ) / 10

  const scenarioData = [
    {
      scenario: "Selected Out",
      retained: Math.max(0, Math.round((100 - selectedShare) * 10) / 10)
    },
    {
      scenario: "Top Route Out",
      retained: Math.max(0, Math.round((100 - topShare) * 10) / 10)
    },
    {
      scenario: "Top 3 Out",
      retained: Math.max(0, Math.round((100 - top3Share) * 10) / 10)
    },
    {
      scenario: "Top 5 Out",
      retained: Math.max(0, Math.round((100 - top5Share) * 10) / 10)
    }
  ]

  const treemapData = coverageData.map((row, index) => ({
    name: row.name,
    size: row.trips,
    fill: VISUAL_COLORS[index % VISUAL_COLORS.length]
  }))

  return (
    <section className="space-y-8">
      <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">People Priority</p>
        <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Reliability And Choice Intelligence</h3>
        <p className="mt-2 text-xs text-cyan-100/70">
          Visuals focused on rider impact: dependency, fallback strength, and route coverage concentration.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="glass-inset rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">Primary Dependency</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-50">{topShare.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-cyan-100/70">Trips controlled by the top route</p>
          </div>

          <div className="glass-inset rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">Routes For 80%</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-50">{routesFor80}</p>
            <p className="mt-1 text-xs text-cyan-100/70">Count needed to cover most demand</p>
          </div>

          <div className="glass-inset rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">Effective Choice Count</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-50">{effectiveChoices.toFixed(1)}</p>
            <p className="mt-1 text-xs text-cyan-100/70">Diversity-adjusted route choices</p>
          </div>

          <div className="glass-inset rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">Selected Route Share</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-50">{selectedShare.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-cyan-100/70">Current route contribution</p>
          </div>
        </div>
      </article>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Coverage Curve</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Pareto Access Visual</h3>
          <p className="mt-2 text-xs text-cyan-100/70">
            Bars show route volume and the line shows cumulative coverage. Click bars to change route focus.
          </p>
          <div className="glass-inset mt-5 h-[340px] rounded-2xl p-3">
            <ResponsiveContainer>
              <ComposedChart data={coverageData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(125,211,252,0.12)" />
                <XAxis dataKey="rankLabel" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: "#a5f3fc", fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "#86efac", fontSize: 11 }} />
                <Tooltip content={<CompactTooltip />} />
                <Bar yAxisId="left" dataKey="trips" radius={[8, 8, 0, 0]}>
                  {coverageData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={VISUAL_COLORS[index % VISUAL_COLORS.length]}
                      opacity={entry.name === selectedRoute ? 1 : 0.72}
                      cursor="pointer"
                      onClick={() => onSelectRoute(entry.name)}
                    />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#34d399" strokeWidth={2.3} dot={{ r: 2 }} />
                <ReferenceLine yAxisId="right" y={80} stroke="rgba(52,211,153,0.55)" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Demand Blocks</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Route Share Treemap</h3>
          <p className="mt-2 text-xs text-cyan-100/70">Area-proportional comparison for top routes at this stop.</p>
          <div className="glass-inset mt-5 h-[340px] rounded-2xl p-2">
            <ResponsiveContainer>
              <Treemap
                data={treemapData}
                dataKey="size"
                stroke="rgba(207,250,254,0.35)"
                aspectRatio={1.2}
                onClick={(payload) => {
                  const routeName = resolveRouteName(payload)
                  if (routeName) {
                    onSelectRoute(routeName)
                  }
                }}
              />
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Outage Scenarios</p>
        <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Service Retention Stress Test</h3>
        <p className="mt-2 text-xs text-cyan-100/70">
          Higher retained values mean riders keep more service even when major routes fail.
        </p>
        <div className="glass-inset mt-5 h-[310px] rounded-2xl p-3">
          <ResponsiveContainer>
            <BarChart data={scenarioData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="rgba(125,211,252,0.12)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "#a5f3fc", fontSize: 11 }} />
              <YAxis dataKey="scenario" type="category" width={104} tick={{ fill: "#a5f3fc", fontSize: 11 }} />
              <Tooltip content={<CompactTooltip />} />
              <Bar dataKey="retained" radius={[8, 8, 8, 8]}>
                {scenarioData.map((entry, index) => (
                  <Cell key={entry.scenario} fill={index === 0 ? "#34d399" : VISUAL_COLORS[(index + 2) % VISUAL_COLORS.length]} />
                ))}
              </Bar>
              <ReferenceLine x={70} stroke="rgba(52,211,153,0.5)" strokeDasharray="4 4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  )
}

export default function RouteVisualLab({ routes, selectedRoute, onSelectRoute }: Props) {
  if (!routes.length) {
    return (
      <section className="mt-8">
        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-sm text-cyan-100/75">Route visual lab is unavailable because no route data was provided for this stop.</p>
        </article>
      </section>
    )
  }

  return (
    <section className="mt-8 space-y-8">
      <RouteSelectorDeck routes={routes} selectedRoute={selectedRoute} onSelectRoute={onSelectRoute} />

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">3D Engine</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Isometric Route Skyline</h3>
          <p className="mt-2 text-xs text-cyan-100/70">Top route volume rendered as pseudo-3D towers. Click any tower to retune all panels.</p>
          <div className="mt-5">
            <RouteIsometricCity routes={routes} selectedRoute={selectedRoute} onSelectRoute={onSelectRoute} />
          </div>
        </article>

        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Profile Scan</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Route Radar Pulse</h3>
          <p className="mt-2 text-xs text-cyan-100/70">A multi-axis signature for the selected route.</p>
          <div className="mt-5">
            <RouteRadarPulse routes={routes} selectedRoute={selectedRoute} />
          </div>
        </article>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Point Cloud</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Scatter Nebula</h3>
          <p className="mt-2 text-xs text-cyan-100/70">Route rank and trip intensity in a bubble field.</p>
          <div className="mt-5">
            <RouteScatterNebula routes={routes} selectedRoute={selectedRoute} onSelectRoute={onSelectRoute} />
          </div>
        </article>

        <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Flow Surface</p>
          <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Route Stream Layers</h3>
          <p className="mt-2 text-xs text-cyan-100/70">Trip layers and cumulative load rendered as moving terrain.</p>
          <div className="mt-5">
            <RouteFlowStream routes={routes} selectedRoute={selectedRoute} />
          </div>
        </article>
      </div>

      <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Radial Dynamics</p>
        <h3 className="mt-2 text-2xl font-semibold text-cyan-50">Route Power Rings</h3>
        <p className="mt-2 text-xs text-cyan-100/70">Circular stack rendering to compare top route pressure bands.</p>
        <div className="mt-5">
          <RoutePowerRings routes={routes} selectedRoute={selectedRoute} />
        </div>
      </article>

      <PeopleFirstInsights routes={routes} selectedRoute={selectedRoute} onSelectRoute={onSelectRoute} />
    </section>
  )
}
