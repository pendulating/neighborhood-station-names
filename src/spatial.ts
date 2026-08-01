/**
 * Multi-layer spatial candidate gathering from MapLibre vector tiles.
 *
 * Queries the `general-tiles` vector source across neighborhood, suburb, road,
 * water, and park label layers. Each feature is scored by its layer weight and
 * proximity to the station, yielding a ranked list of `NameCandidate` values.
 *
 * Missing layers are handled gracefully (returned as empty arrays) so the
 * caller always gets a result, even on maps that only include a subset of
 * label layers.
 */

import type { Coordinate } from './types/core';
import type { MaplibreLike, MapFeature, NameCandidate, CandidateSource, NamingSettings } from './types/naming';

const SOURCE_ID = 'general-tiles';

/**
 * Source layers that may carry place-name labels. Not every map tile set
 * includes all of them; missing layers are silently skipped.
 */
const LABEL_SOURCE_LAYERS = [
  'neighborhood_labels',
  'suburb_labels',
  'road_labels',
  'water_labels',
  'park_labels',
] as const;

/**
 * Layer weight determines how much a given source type contributes to the
 * composite score. Higher weights are assigned to sources that typically
 * produce more meaningful station names.
 */
const LAYER_WEIGHTS: Record<CandidateSource, number> = {
  neighborhood: 1.0,
  suburb: 0.9,
  park: 0.7,
  water: 0.5,
  road: 0.4,
};

/**
 * Map source-layer names to the `CandidateSource` they represent.
 */
const LAYER_TO_SOURCE: Record<string, CandidateSource> = {
  neighborhood_labels: 'neighborhood',
  suburb_labels: 'suburb',
  road_labels: 'road',
  water_labels: 'water',
  park_labels: 'park',
};

/**
 * Gather scored name candidates from every available label layer within
 * `settings.radiusM` of the station coordinates.
 *
 * Returns an empty array if the map is unavailable, the source is missing,
 * or no label falls within the search radius.
 *
 * @param map    The MapLibre-like map instance (may be null).
 * @param coords Station coordinates as [lng, lat].
 * @param settings Current naming settings (radiusM, mode, etc.).
 * @returns       Candidates sorted by score descending.
 */
export function findNameCandidates(
  map: MaplibreLike | null,
  coords: Coordinate,
  settings: NamingSettings,
): NameCandidate[] {
  if (!map || typeof map.querySourceFeatures !== 'function') {
    console.warn('[Spatial] map unavailable or missing querySourceFeatures');
    return [];
  }
  if (typeof map.getSource === 'function' && !map.getSource(SOURCE_ID)) {
    console.warn(`[Spatial] source "${SOURCE_ID}" not found on map`);
    return [];
  }

  const radiusM = settings.radiusM;
  const candidates: NameCandidate[] = [];

  for (const sourceLayer of LABEL_SOURCE_LAYERS) {
    const source = LAYER_TO_SOURCE[sourceLayer];
    const weight = LAYER_WEIGHTS[source];
    if (weight <= 0) continue;

    const features = queryFeatures(map, sourceLayer);

    for (const feature of features) {
      const name = feature?.properties?.name;
      const point = pointOf(feature);
      if (typeof name !== 'string' || !name || !point) continue;

      const distanceM = haversineMeters(coords, point);
      if (distanceM > radiusM) continue;

      const score = weight * (1 - distanceM / radiusM);

      candidates.push({
        name,
        source,
        distanceM,
        score,
        featureCoords: point,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
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
    const [lng, lat] = geom.coordinates;
    if (typeof lng === 'number' && typeof lat === 'number') {
      return [lng, lat];
    }
  }
  // Some tilers emit labels as MultiPoint; use the first point.
  if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
    const first = geom.coordinates[0];
    if (Array.isArray(first)) {
      const [lng, lat] = first;
      if (typeof lng === 'number' && typeof lat === 'number') {
        return [lng, lat];
      }
    }
  }
  return null;
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Compute the haversine distance in metres between two geographic coordinates.
 *
 * @param a First coordinate [lng, lat].
 * @param b Second coordinate [lng, lat].
 * @returns  Distance in metres.
 */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}