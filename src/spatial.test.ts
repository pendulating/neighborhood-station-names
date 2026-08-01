import { describe, expect, it } from 'vitest';
import { findNameCandidates } from './spatial';
import type { MaplibreLike } from './types/naming';
import type { NamingSettings } from './types/naming';

const settings: NamingSettings = {
  enabled: true,
  mode: 'neighborhood',
  disambiguation: 'auto',
  radiusM: 500,
  sequentialFormat: 'number',
};

function makeMap(features: Array<{ name: string; lng: number; lat: number; layer: string }>): MaplibreLike {
  return {
    querySourceFeatures(_sourceId: string, params: { sourceLayer?: string }) {
      const layer = params.sourceLayer ?? '';
      return features
        .filter((f) => f.layer === layer)
        .map((f) => ({
          geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
          properties: { name: f.name },
        }));
    },
    getSource: () => ({}),
  };
}

describe('findNameCandidates', () => {
  it('populates featureCoords with the label centroid', () => {
    const map = makeMap([
      { name: 'Greenpoint', lng: -73.95, lat: 40.73, layer: 'neighborhood_labels' },
    ]);

    const candidates = findNameCandidates(map, [-73.95, 40.73], settings);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].name).toBe('Greenpoint');
    expect(candidates[0].featureCoords).toEqual([-73.95, 40.73]);
  });

  it('returns empty array when map is null', () => {
    const candidates = findNameCandidates(null, [-73.95, 40.73], settings);
    expect(candidates).toEqual([]);
  });

  it('excludes features beyond the search radius', () => {
    const map = makeMap([
      { name: 'Far Away', lng: -73.0, lat: 41.5, layer: 'neighborhood_labels' },
    ]);

    const candidates = findNameCandidates(map, [-73.95, 40.73], settings);
    expect(candidates).toEqual([]);
  });

  it('scores closer features higher', () => {
    const map = makeMap([
      { name: 'Near', lng: -73.95, lat: 40.7301, layer: 'neighborhood_labels' },
      { name: 'Far', lng: -73.95, lat: 40.734, layer: 'neighborhood_labels' },
    ]);

    const candidates = findNameCandidates(map, [-73.95, 40.73], settings);
    expect(candidates[0].name).toBe('Near');
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
  });
});
