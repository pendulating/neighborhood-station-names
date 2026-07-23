/**
 * Look up the nearest neighborhood or suburb name for a coordinate, from the
 * base map's vector tiles.
 *
 * Neighborhood names are not in the city data files; they live in the
 * `general-tiles` vector source as point labels. Rather than casting a wide
 * radius per layer and taking the first layer that has anything, we gather
 * every nearby neighborhood and suburb label and select the single nearest one
 * (a k-nearest-neighbours selection with the nearest neighbour winning). This
 * lets a closer suburb be chosen over a more distant neighborhood.
 *
 * City labels are deliberately excluded: they are too coarse for station naming,
 * so when nothing local qualifies we leave the game's road-based name in place.
 */

import type { Coordinate } from './types/core';

const SOURCE_ID = 'general-tiles';

/**
 * Label layers considered for naming. The nearest label across both wins, so
 * order is not a priority. `city_labels` is intentionally omitted (see above).
 */
const LABEL_SOURCE_LAYERS = ['neighborhood_labels', 'suburb_labels'] as const;

/**
 * How far (in metres) a label may be from the station and still be used. Beyond
 * this we leave the game's road-based name in place. Deliberately tight: labels
 * sit at area centroids, and we only want genuinely local names.
 */
const MAX_LABEL_DISTANCE_M = 500;

interface Candidate {
  name: string;
  distanceM: number;
}

/**
 * Returns the name of the nearest neighborhood/suburb label within
 * `MAX_LABEL_DISTANCE_M` of `coords`, or null if the map/source is unavailable
 * or nothing qualifies (caller should leave the existing road-based name).
 */
export function findNeighborhoodName(map: MaplibreLike | null, coords: Coordinate): string | null {
  if (!map || typeof map.querySourceFeatures !== 'function') return null;
  if (typeof map.getSource === 'function' && !map.getSource(SOURCE_ID)) return null;

  let best: Candidate | null = null;
  for (const sourceLayer of LABEL_SOURCE_LAYERS) {
    for (const feature of queryFeatures(map, sourceLayer)) {
      const name = feature?.properties?.name;
      const point = pointOf(feature);
      if (typeof name !== 'string' || !name || !point) continue;

      const distanceM = haversineMeters(coords, point);
      if (distanceM > MAX_LABEL_DISTANCE_M) continue;
      if (!best || distanceM < best.distanceM) {
        best = { name, distanceM };
      }
    }
  }
  return best ? best.name : null;
}

/** Query a single source-layer, returning [] if its tiles fail to load. */
function queryFeatures(map: MaplibreLike, sourceLayer: string): MapFeature[] {
  try {
    const features = map.querySourceFeatures(SOURCE_ID, {
      sourceLayer,
      filter: ['has', 'name'],
    });
    return features ?? [];
  } catch {
    return [];
  }
}

/** Extract a representative [lng, lat] from a feature's geometry. */
function pointOf(feature: MapFeature): Coordinate | null {
  const geom = feature?.geometry;
  if (!geom) return null;
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    return geom.coordinates as Coordinate;
  }
  // Some tilers emit labels as MultiPoint; use the first point.
  if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
    return geom.coordinates[0] as Coordinate;
  }
  return null;
}

const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// --- Minimal structural types for the bits of MapLibre we use -----------------
// (The API types `getMap()` as `maplibregl.Map`, but maplibre-gl isn't a runtime
//  dependency of the mod, so we describe just what we touch.)

interface MapGeometry {
  type: string;
  coordinates: unknown;
}

interface MapFeature {
  geometry?: MapGeometry;
  properties?: { name?: unknown; [key: string]: unknown };
}

export interface MaplibreLike {
  querySourceFeatures(sourceId: string, params: { sourceLayer?: string; filter?: unknown[] }): MapFeature[];
  getSource?(id: string): unknown;
}
