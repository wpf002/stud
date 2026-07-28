/** Great-circle distance in statute miles. Used by every distance filter. */
export function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bounding box for a radius search. Used to prefilter in SQL before the exact
 * haversine pass — a full table scan with trig in the WHERE clause does not
 * survive contact with a real dataset.
 */
export function boundingBox(lat: number, lon: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0;
  const lonDelta = radiusMiles / (69.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

/** Rough drive time. Breeders think in hours, not miles ("3 hours of DFW"). */
export function estimatedDriveHours(miles: number): number {
  return Math.round((miles / 55) * 10) / 10;
}
