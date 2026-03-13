"use client"

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet"
import type { LatLngExpression } from "leaflet"
import { useEffect } from "react"

type Stop = {
  name: string
  trips: number
  lat: number
  lng: number
}

type Props = {
  stops: Stop[]
}

export default function StopsMap({ stops }: Props) {

  const center: LatLngExpression = [12.97, 77.59]

  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, 200)
  }, [])

  return (
    <div style={{ height: "600px", width: "100%" }}>
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {stops.map((stop, index) => (
          <CircleMarker
            key={index}
            center={[stop.lat, stop.lng] as LatLngExpression}
            radius={Math.max(5, stop.trips / 50)}
          >
            <Tooltip>
              <div>
                <strong>{stop.name}</strong>
                <br />
                Trips: {stop.trips}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}