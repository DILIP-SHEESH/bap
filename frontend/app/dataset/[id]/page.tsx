"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { use, useEffect, useMemo, useRef, useState } from "react"
import RouteDistributionChart from "../../components/RouteDistributionChart"
import RouteVisualLab from "../../components/RouteVisualLab"

const StopsMap = dynamic(() => import("../../components/StopsMap"), {
  ssr: false
})

type DatasetItem = {
  id: number | string
  data: Record<string, unknown>
}

type Route = {
  name: string
  trips: number
}

function parseRoutes(value: unknown): Route[] {
  if (typeof value !== "string" || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value.replace(/'/g, '"')) as Record<string, unknown>

    return Object.entries(parsed)
      .map(([name, trips]) => ({
        name,
        trips: Number(trips) || 0
      }))
      .filter((route) => route.trips > 0)
      .sort((a, b) => b.trips - a.trips)
  } catch {
    return []
  }
}

function AnimatedMetric({
  label,
  value,
  suffix = "",
  prefix = "",
  description
}: {
  label: string
  value: number
  suffix?: string
  prefix?: string
  description: string
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const previousValue = useRef(0)

  useEffect(() => {
    let frame = 0
    let startedAt = 0
    const from = previousValue.current
    const delta = value - from
    const duration = 1200

    const animate = (time: number) => {
      if (!startedAt) {
        startedAt = time
      }

      const progress = Math.min((time - startedAt) / duration, 1)
      const eased = 1 - (1 - progress) ** 3

      setDisplayValue(from + delta * eased)

      if (progress < 1) {
        frame = requestAnimationFrame(animate)
      } else {
        previousValue.current = value
      }
    }

    frame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-cyan-100/20 bg-cyan-100/[0.03] p-4 backdrop-blur-md">
      <div className="absolute inset-0 opacity-0 transition duration-700 group-hover:opacity-100 [background:radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.25),transparent_58%)]" />
      <p className="relative text-xs uppercase tracking-[0.24em] text-cyan-100/70">{label}</p>
      <p className="relative mt-3 text-3xl font-semibold text-cyan-50">
        {prefix}
        {Math.round(displayValue).toLocaleString("en-IN")}
        {suffix}
      </p>
      <p className="relative mt-1 text-xs text-cyan-100/65">{description}</p>
    </div>
  )
}

function RouteOrbit({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  if (routes.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.02] p-8 text-center text-cyan-100/70">
        Route-level data is unavailable for this stop.
      </div>
    )
  }

  const maxTrips = routes[0]?.trips || 1
  const orbitalNodes = routes.slice(0, 8).map((route, index, arr) => {
    const angle = (index / arr.length) * Math.PI * 2 - Math.PI / 2
    const intensity = route.trips / maxTrips
    const radius = 26 + intensity * 15

    return {
      ...route,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      intensity
    }
  })

  return (
    <div className="relative mt-6 h-[360px] overflow-hidden rounded-2xl border border-cyan-100/20 bg-[#04131f]">
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="absolute inset-0 [background:radial-gradient(circle_at_50%_50%,rgba(125,211,252,0.22),rgba(8,47,73,0.7)_42%,rgba(2,6,23,0.95)_80%)]" />
      <div className="absolute inset-0 route-orbit-grid" />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {orbitalNodes.map((node, index) => (
          <line
            key={`${node.name}-beam-${index}`}
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke="rgba(125, 211, 252, 0.46)"
            strokeWidth="0.25"
            style={{ animation: `beamPulse 2.8s ease-in-out ${index * 0.2}s infinite` }}
          />
        ))}

        <circle cx="50" cy="50" r="8" fill="rgba(34, 211, 238, 0.88)" />
        <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(34,211,238,0.35)" strokeWidth="0.35" />
      </svg>

      {orbitalNodes.map((node, index) => {
        const isSelected = node.name === selectedRoute

        return (
        <div
          key={node.name}
          className="group absolute cursor-pointer"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            transform: "translate(-50%, -50%)"
          }}
          onClick={() => onSelectRoute(node.name)}
        >
          <div
            className={`rounded-full border shadow-[0_0_25px_rgba(34,211,238,0.55)] backdrop-blur-sm ${
              isSelected ? "border-cyan-100 bg-cyan-200/55" : "border-cyan-100/45 bg-cyan-300/25"
            }`}
            style={{
              width: `${16 + node.intensity * 22 + (isSelected ? 8 : 0)}px`,
              height: `${16 + node.intensity * 22 + (isSelected ? 8 : 0)}px`,
              animation: `nodePulse 2.6s ease-in-out ${index * 0.15}s infinite`
            }}
          />
          <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded-md border border-cyan-100/20 bg-slate-950/70 px-2 py-1 text-xs text-cyan-50 opacity-0 transition duration-300 group-hover:opacity-100">
            {node.name} | {node.trips.toLocaleString("en-IN")}
          </div>
        </div>
        )
      })}
    </div>
  )
}

function RoutePulseList({
  routes,
  selectedRoute,
  onSelectRoute
}: {
  routes: Route[]
  selectedRoute: string
  onSelectRoute: (name: string) => void
}) {
  if (routes.length === 0) {
    return null
  }

  const topRoutes = routes.slice(0, 6)
  const maxTrips = topRoutes[0]?.trips || 1

  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {topRoutes.map((route, index) => {
        const width = Math.max(10, (route.trips / maxTrips) * 100)

        return (
          <button
            key={route.name}
            type="button"
            onClick={() => onSelectRoute(route.name)}
            className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
              selectedRoute === route.name
                ? "border-cyan-200/60 bg-cyan-300/[0.12]"
                : "border-cyan-100/10 bg-cyan-100/[0.02] hover:border-cyan-100/30"
            }`}
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="mb-2 flex items-center justify-between text-sm text-cyan-50">
              <span className="truncate pr-2">{route.name}</span>
              <span>{route.trips.toLocaleString("en-IN")}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cyan-100/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 shadow-[0_0_14px_rgba(56,189,248,0.7)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function DatasetPage({ params }: { params: Promise<{ id: string }> }) {

  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [item, setItem] = useState<DatasetItem | null | undefined>(undefined)
  const [selectedRoute, setSelectedRoute] = useState("")

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/data/raw_tenders")
      .then((res) => res.json())
      .then((data) => {
        const found = data.data.find((datasetItem: DatasetItem) => datasetItem.id == id)
        setItem(found ?? null)
      })
      .catch(() => {
        setItem(null)
      })
  }, [id])

  const stop = item?.data ?? {}
  const stopName = String(stop["Stop Name"] ?? "Unknown Stop")
  const tripCount = Number(stop["Num trips in stop"] ?? 0)
  const latitude = Number(stop["Latitude"] ?? 0)
  const longitude = Number(stop["Longitude"] ?? 0)
  const routeSource = typeof stop["Routes with num trips"] === "string" ? stop["Routes with num trips"] : ""
  const routes = useMemo(() => parseRoutes(routeSource), [routeSource])
  const activeSelectedRoute = routes.some((route) => route.name === selectedRoute)
    ? selectedRoute
    : (routes[0]?.name ?? "")

  const setSelectedRouteName = (routeName: string) => {
    setSelectedRoute(routeName)
  }

  const selectedRouteData = routes.find((route) => route.name === activeSelectedRoute)
  const topRoute = routes[0]
  const totalRouteTrips = routes.reduce((sum, route) => sum + route.trips, 0)
  const concentration = topRoute ? Math.round((topRoute.trips / totalRouteTrips) * 100) : 0

  if (item === undefined) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030712] text-cyan-50">
        <div className="absolute inset-0 aurora-mesh opacity-80" />
        <div className="relative rounded-2xl border border-cyan-100/25 bg-slate-900/60 px-6 py-4 backdrop-blur-xl">
          <span className="route-loading inline-block text-sm tracking-[0.3em] text-cyan-200/80">LOADING STOP SIGNAL</span>
        </div>
      </main>
    )
  }

  if (!item) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] text-cyan-50">
        <div className="absolute inset-0 aurora-mesh opacity-75" />
        <div className="relative rounded-3xl border border-cyan-100/25 bg-slate-900/70 p-8 text-center backdrop-blur-xl">
          <p className="text-xl font-semibold">Stop not found</p>
          <p className="mt-2 text-cyan-100/75">The selected stop could not be loaded.</p>
          <Link href="/" className="mt-6 inline-flex rounded-lg border border-cyan-100/25 px-4 py-2 text-sm text-cyan-50 hover:bg-cyan-100/10">
            Back to stop list
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-cyan-50">
      <div className="aurora-mesh absolute inset-0 opacity-90" />
      <div className="absolute -left-24 top-16 h-[420px] w-[420px] rounded-full bg-cyan-500/20 blur-[140px]" />
      <div className="absolute -right-20 top-52 h-[320px] w-[320px] rounded-full bg-blue-500/20 blur-[120px]" />
      <div className="absolute bottom-8 left-1/3 h-[300px] w-[300px] rounded-full bg-emerald-400/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-cyan-100/25 bg-slate-950/60 px-4 py-2 text-xs tracking-[0.2em] text-cyan-100/85 transition hover:-translate-y-0.5 hover:bg-cyan-300/10"
        >
          <span className="text-lg leading-none">&lt;-</span>
          STOP MATRIX
        </Link>

        <section className="glass-surface mt-6 overflow-hidden rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
          <p className="text-xs uppercase tracking-[0.42em] text-cyan-100/60">Transit Singularity</p>

          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-transparent [background:linear-gradient(97deg,#ecfeff_0%,#7dd3fc_40%,#34d399_100%)] bg-clip-text md:text-6xl">
            {stopName}
          </h1>

          <p className="mt-4 max-w-2xl text-sm text-cyan-100/75 md:text-base">
            High-intensity view for the selected stop. Every pulse below is generated from route mix, trip volume, and geo-position data.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnimatedMetric label="Total Trips" value={tripCount} description="Stop throughput signal" />
            <AnimatedMetric label="Routes Active" value={routes.length} description="Distinct route channels" />
            <AnimatedMetric
              label="Top Route Share"
              value={concentration}
              suffix="%"
              description={topRoute ? `${topRoute.name} dominates` : "No route dominance"}
            />
            <AnimatedMetric label="Route Volume" value={totalRouteTrips} description="Combined route trip count" />
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Visualization Core</p>
                <h2 className="mt-2 text-2xl font-semibold text-cyan-50">Route Orbit Engine</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-200/25 px-3 py-1 text-xs text-cyan-100/70">Live Breakdown</span>
                {selectedRouteData ? (
                  <span className="rounded-full border border-cyan-200/35 bg-cyan-300/[0.16] px-3 py-1 text-xs text-cyan-50">
                    Focus: {selectedRouteData.name}
                  </span>
                ) : null}
              </div>
            </div>

            <RouteOrbit routes={routes} selectedRoute={activeSelectedRoute} onSelectRoute={setSelectedRouteName} />
            <RoutePulseList routes={routes} selectedRoute={activeSelectedRoute} onSelectRoute={setSelectedRouteName} />
          </article>

          <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Geo Trace</p>
            <h2 className="mt-2 text-2xl font-semibold text-cyan-50">Stop Lock</h2>

            <div className="mt-5 overflow-hidden rounded-2xl border border-cyan-100/15">
              <StopsMap
                stops={[
                  {
                    name: stopName,
                    trips: tripCount,
                    lat: latitude,
                    lng: longitude
                  }
                ]}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-cyan-100/80">
              <div className="rounded-xl border border-cyan-100/10 bg-cyan-100/[0.03] p-3">
                <p className="text-cyan-100/60">Latitude</p>
                <p className="mt-1 text-base text-cyan-50">{latitude.toFixed(5)}</p>
              </div>
              <div className="rounded-xl border border-cyan-100/10 bg-cyan-100/[0.03] p-3">
                <p className="text-cyan-100/60">Longitude</p>
                <p className="mt-1 text-base text-cyan-50">{longitude.toFixed(5)}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-8">
          <article className="glass-surface rounded-3xl border border-cyan-100/20 p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-cyan-100/55">Signal Analysis</p>
                <h2 className="mt-2 text-2xl font-semibold text-cyan-50">Route Energy Distribution</h2>
              </div>
            </div>

            <RouteDistributionChart
              routes={routes}
              selectedRoute={activeSelectedRoute}
              onSelectRoute={setSelectedRouteName}
            />
          </article>
        </section>

        <RouteVisualLab routes={routes} selectedRoute={activeSelectedRoute} onSelectRoute={setSelectedRouteName} />
      </div>
    </main>
  )
}
