export function transformStops(data: any[]) {
  return data.map((row) => ({
    name: row.data["Stop Name"],
    trips: row.data["Num trips in stop"],
    lat: row.data["Latitude"],
    lng: row.data["Longitude"],
  }))
}