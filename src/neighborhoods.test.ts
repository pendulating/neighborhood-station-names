import { describe, expect, it } from 'vitest';
import { findNeighborhoodName, type MaplibreLike } from './neighborhoods';
import type { Coordinate } from './types/core';

const HOME: Coordinate = [-74.0, 40.7];

// ~1113m per 0.01deg latitude at this location; chosen with wide margins around
// the 4000m cutoff so tests are not sensitive to haversine rounding.
const NEAR = 0.01; // ~1.1km  -> inside cutoff
const MID = 0.02; //  ~2.2km  -> inside cutoff
const FAR = 0.05; //  ~5.6km  -> outside cutoff

type LabelSpec = {
  name: string;
  lng?: number;
  lat?: number;
  geom?: 'Point' | 'MultiPoint' | 'none';
  props?: Record<string, unknown>;
};

function makeMap(
  layers: Record<string, LabelSpec[]>,
  options: { source?: boolean; noGetSource?: boolean; throwLayers?: string[] } = {},
): MaplibreLike {
  const { source = true, noGetSource = false, throwLayers = [] } = options;
  const map: MaplibreLike = {
    querySourceFeatures: (_sourceId, params) => {
      if (throwLayers.includes(params.sourceLayer ?? '')) throw new Error('tile load failed');
      const specs = layers[params.sourceLayer ?? ''] ?? [];
      return specs.map((s) => {
        const lng = s.lng ?? HOME[0];
        const lat = s.lat ?? HOME[1];
        const properties = { name: s.name, ...s.props };
        if (s.geom === 'none') return { properties };
        if (s.geom === 'MultiPoint') {
          return { geometry: { type: 'MultiPoint', coordinates: [[lng, lat], [lng + 1, lat]] }, properties };
        }
        return { geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
      });
    },
  };
  if (!noGetSource) {
    map.getSource = (id: string) => (source && id === 'general-tiles' ? {} : undefined);
  }
  return map;
}

describe('findNeighborhoodName', () => {
  it('returns null when the map is null', () => {
    expect(findNeighborhoodName(null, HOME)).toBeNull();
  });

  it('returns null when querySourceFeatures is unavailable', () => {
    expect(findNeighborhoodName({} as MaplibreLike, HOME)).toBeNull();
  });

  it('returns null when the general-tiles source is not loaded', () => {
    const map = makeMap({ neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + NEAR }] }, { source: false });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('still queries when the map exposes no getSource', () => {
    const map = makeMap({ neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + NEAR }] }, { noGetSource: true });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('returns the nearest neighborhood label within range', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: 'FarSide', lat: HOME[1] + MID },
        { name: 'Greenpoint', lat: HOME[1] + NEAR },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('returns null when no labels exist in any layer', () => {
    const map = makeMap({});
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('rejects labels beyond the 4000m cutoff', () => {
    const map = makeMap({ neighborhood_labels: [{ name: 'TooFar', lat: HOME[1] + FAR }] });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('prefers neighborhood_labels over suburb_labels even when a suburb is closer', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + MID }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + NEAR }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('falls back to suburb_labels when the nearest neighborhood is out of range', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'TooFar', lat: HOME[1] + FAR }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + NEAR }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('falls back to suburb_labels when there are no neighborhood labels', () => {
    const map = makeMap({ suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + NEAR }] });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('falls back to city_labels as a last resort', () => {
    const map = makeMap({ city_labels: [{ name: 'New York', lat: HOME[1] + NEAR }] });
    expect(findNeighborhoodName(map, HOME)).toBe('New York');
  });

  it('returns null when every layer is out of range', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'a', lat: HOME[1] + FAR }],
      suburb_labels: [{ name: 'b', lat: HOME[1] + FAR }],
      city_labels: [{ name: 'c', lat: HOME[1] + FAR }],
    });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('uses the first point of a MultiPoint label', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + NEAR, geom: 'MultiPoint' }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips features without usable geometry', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: 'NoGeom', geom: 'none' },
        { name: 'Greenpoint', lat: HOME[1] + NEAR },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips features whose name is missing, empty, or not a string', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: '', lat: HOME[1] + NEAR },
        { name: 'x', lat: HOME[1] + NEAR, props: { name: 123 } },
        { name: 'Greenpoint', lat: HOME[1] + NEAR },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips a layer whose tiles throw and continues to the next', () => {
    const map = makeMap(
      {
        neighborhood_labels: [{ name: 'Broken', lat: HOME[1] + NEAR }],
        suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + NEAR }],
      },
      { throwLayers: ['neighborhood_labels'] },
    );
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });
});
