import { describe, expect, it } from 'vitest';
import { findNeighborhoodName, type MaplibreLike } from './neighborhoods';
import type { Coordinate } from './types/core';

const HOME: Coordinate = [-74.0, 40.7];

// Latitude offsets chosen with wide margins around the 500m cutoff so tests are
// not sensitive to haversine rounding (~111m per 0.001deg latitude here).
const CLOSE = 0.001; // ~111m -> closest
const WITHIN = 0.003; // ~333m -> inside the cutoff
const BEYOND = 0.006; // ~667m -> outside the cutoff

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
    const map = makeMap({ neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + CLOSE }] }, { source: false });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('still queries when the map exposes no getSource', () => {
    const map = makeMap({ neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + CLOSE }] }, { noGetSource: true });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('returns the nearest neighborhood label within range', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: 'FarSide', lat: HOME[1] + WITHIN },
        { name: 'Greenpoint', lat: HOME[1] + CLOSE },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('returns null when no labels exist in any layer', () => {
    expect(findNeighborhoodName(makeMap({}), HOME)).toBeNull();
  });

  it('rejects labels beyond the cutoff', () => {
    const map = makeMap({ neighborhood_labels: [{ name: 'TooFar', lat: HOME[1] + BEYOND }] });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('prefers a closer suburb over a farther neighborhood (nearest wins)', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + WITHIN }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + CLOSE }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('prefers a closer neighborhood over a farther suburb', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + CLOSE }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + WITHIN }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('uses a suburb when no neighborhood is within range', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Far', lat: HOME[1] + BEYOND }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + CLOSE }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('uses a suburb when there are no neighborhood labels', () => {
    const map = makeMap({ suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + CLOSE }] });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('ignores city labels even when they are the closest', () => {
    const map = makeMap({
      city_labels: [{ name: 'New York', lat: HOME[1] + CLOSE }],
      suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + WITHIN }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });

  it('returns null when only city labels are nearby', () => {
    const map = makeMap({ city_labels: [{ name: 'New York', lat: HOME[1] + CLOSE }] });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('returns null when every neighborhood/suburb label is out of range', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'a', lat: HOME[1] + BEYOND }],
      suburb_labels: [{ name: 'b', lat: HOME[1] + BEYOND }],
      city_labels: [{ name: 'c', lat: HOME[1] + CLOSE }],
    });
    expect(findNeighborhoodName(map, HOME)).toBeNull();
  });

  it('uses the first point of a MultiPoint label', () => {
    const map = makeMap({
      neighborhood_labels: [{ name: 'Greenpoint', lat: HOME[1] + CLOSE, geom: 'MultiPoint' }],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips features without usable geometry', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: 'NoGeom', geom: 'none' },
        { name: 'Greenpoint', lat: HOME[1] + CLOSE },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips features whose name is missing, empty, or not a string', () => {
    const map = makeMap({
      neighborhood_labels: [
        { name: '', lat: HOME[1] + CLOSE },
        { name: 'x', lat: HOME[1] + CLOSE, props: { name: 123 } },
        { name: 'Greenpoint', lat: HOME[1] + CLOSE },
      ],
    });
    expect(findNeighborhoodName(map, HOME)).toBe('Greenpoint');
  });

  it('skips a layer whose tiles throw and continues to the next', () => {
    const map = makeMap(
      {
        neighborhood_labels: [{ name: 'Broken', lat: HOME[1] + CLOSE }],
        suburb_labels: [{ name: 'Brooklyn', lat: HOME[1] + CLOSE }],
      },
      { throwLayers: ['neighborhood_labels'] },
    );
    expect(findNeighborhoodName(map, HOME)).toBe('Brooklyn');
  });
});
