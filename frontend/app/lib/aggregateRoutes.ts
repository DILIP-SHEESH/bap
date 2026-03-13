export function aggregateRoutes(rawData: any[]) {

  const routeTotals: Record<string, number> = {}

  rawData.forEach((row) => {

    const routesString = row.data["Routes with num trips"]

    if (!routesString) return

    try {

      const routes = JSON.parse(
        routesString.replace(/'/g, '"')
      )

      Object.entries(routes).forEach(([route, trips]) => {

        routeTotals[route] =
          (routeTotals[route] || 0) + Number(trips)

      })

    } catch (err) {
      console.log("Route parse error")
    }

  })

  return Object.entries(routeTotals)
    .map(([name, trips]) => ({
      name,
      trips
    }))
}