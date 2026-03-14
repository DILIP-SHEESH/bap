"use client"

import { useEffect, useMemo } from "react"
import { latLngBounds } from "leaflet"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet"

export type GeoPoint = {
  lat: number
  lng: number
  label: string
  value?: number
}

function FitBounds({ points }: { points: GeoPoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12)
      return
    }

    const bounds = latLngBounds(
      points.map((point) => [point.lat, point.lng] as [number, number]),
    )
    map.fitBounds(bounds.pad(0.25), { maxZoom: 13 })
  }, [map, points])

  return null
}

export default function StopsMap({ points }: { points: GeoPoint[] }) {
  const center = useMemo<[number, number]>(() => {
    if (points.length === 0) return [20.5937, 78.9629]
    return [points[0].lat, points[0].lng]
  }, [points])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={center}
        zoom={5}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((point, index) => (
          <CircleMarker
            key={`${point.lat}-${point.lng}-${index}`}
            center={[point.lat, point.lng]}
            radius={6}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#3b82f6",
              fillOpacity: 0.85,
              weight: 1,
            }}
          >
            <Tooltip>
              <div className="text-xs">
                <p className="font-semibold text-slate-900">{point.label}</p>
                {point.value !== undefined && (
                  <p className="text-slate-600">Value: {point.value.toLocaleString()}</p>
                )}
                <p className="text-slate-500">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </p>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}