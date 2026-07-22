/**
 * Look up the nearest neighborhood name for a coordinate, from the base map's
 * vector tiles.
 *
 * Neighborhood names are not in the city data files — they live in the
 * `general-tiles` vector source as point labels. We query the loaded tiles and
 * pick the nearest label to the station. Source-layers are tried in order of
 * specificity so areas without a neighborhood still get a sensible name.
 */

import type { Coordinate } from './types/core';

const SOURCE_ID = 'general-tiles';

/** Most specific first. A station falls back to the next if none is found nearby. */
const LABEL_SOURCE_LAYERS = ['neighborhood_labels', 'suburb_labels', 'city_labels'] as const;

/**
 * How far (in meters) a label may be from the station and still be used.
 * Neighborhood labels sit at area centroids, so we allow a generous radius;
 * `city_labels` can be far, so it acts mainly as a last resort.
 */
const MAX_LABEL_DISTANCE_M = 4000;

interface Candidate {
  name: string;
  distanceM: number;
}

/**
 * Returns the nearest neighborhood/suburb/city label name to `coords`, or null
 * if the map, source, or tiles aren't available (caller should leave the
 * existing road-based name in that case).
 */
export function findNeighborhoodName(map: MaplibreLike | null, coords: Coordinate): string | null {
  if (!map || typeof map.querySourceFeatures !== 'function') return null;
  if (typeof map.getSource === 'function' && !map.getSource(SOURCE_ID)) return null;

  for (const sourceLayer of LABEL_SOURCE_LAYERS) {
    const nearest = nearestLabel(map, sourceLayer, coords);
    if (nearest && nearest.distanceM <= MAX_LABEL_DISTANCE_M) {
      return nearest.name;
    }
  }
  return null;
}

function nearestLabel(map: MaplibreLike, sourceLayer: string, coords: Coordinate): Candidate | null {
  let features: MapFeature[];
  try {
    features = map.querySourceFeatures(SOURCE_ID, {
      sourceLayer,
      filter: ['has', 'name'],
    });
  } catch {
    return null;
  }
  if (!features || features.length === 0) return null;

  let best: Candidate | null = null;
  for (const feature of features) {
    const name = feature?.properties?.name;
    const point = pointOf(feature);
    if (typeof name !== 'string' || !name || !point) continue;

    const distanceM = haversineMeters(coords, point);
    if (!best || distanceM < best.distanceM) {
      best = { name, distanceM };
    }
  }
  return best;
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
