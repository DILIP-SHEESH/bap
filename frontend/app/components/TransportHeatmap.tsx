"use client"

import { MapContainer, TileLayer, useMap } from "react-leaflet"
import "leaflet.heat"
import { useEffect } from "react"
import L from "leaflet"

type Stop = {
  lat: number
  lng: number
  trips: number
}

function HeatLayer({ stops }: { stops: Stop[] }) {

  const map = useMap()

  useEffect(() => {

    const points = stops.map((s) => [
      s.lat,
      s.lng,
      s.trips / 1000
    ])

    const heat = (L as any).heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 17
    })

    heat.addTo(map)

    return () => {
      map.removeLayer(heat)
    }

  }, [stops, map])

  return null
}

export default function TransportHeatmap({ stops }: { stops: Stop[] }) {

  return (
    <div className="w-full h-[600px]">

      <MapContainer
        center={[12.97, 77.59]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
      >

        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <HeatLayer stops={stops} />

      </MapContainer>

    </div>
  )
}