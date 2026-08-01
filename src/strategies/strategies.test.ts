import { describe, expect, it } from 'vitest';
import { getStrategy, ALL_STRATEGIES } from './index';
import { neighborhoodStrategy } from './neighborhood';
import { streetStrategy } from './street';
import { sequentialStrategy } from './sequential';
import type { StrategyContext, NamingSettings, MaplibreLike } from '../types/naming';

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

function makeCtx(map: MaplibreLike | null): StrategyContext {
  const settings: NamingSettings = {
    enabled: true,
    mode: 'neighborhood',
    disambiguation: 'auto',
    radiusM: 500,
    sequentialFormat: 'number',
  };
  return {
    coords: [-73.95, 40.73],
    stationId: 's1',
    routeIds: ['r1'],
    map,
    settings,
    usedNames: new Set(),
  };
}

describe('getStrategy', () => {
  it('resolves each registered mode', () => {
    expect(getStrategy('neighborhood')).toBe(neighborhoodStrategy);
    expect(getStrategy('street')).toBe(streetStrategy);
    expect(getStrategy('sequential')).toBe(sequentialStrategy);
  });

  it('falls back to neighborhood for an unrecognised mode', () => {
    expect(getStrategy('bogus' as never)).toBe(neighborhoodStrategy);
  });

  it('ALL_STRATEGIES contains exactly three strategies', () => {
    expect(ALL_STRATEGIES).toHaveLength(3);
  });
});

describe('neighborhoodStrategy', () => {
  it('returns only neighborhood and suburb candidates', () => {
    const map = makeMap([
      { name: 'Greenpoint', lng: -73.95, lat: 40.7301, layer: 'neighborhood_labels' },
      { name: 'Bloor Street', lng: -73.95, lat: 40.7302, layer: 'road_labels' },
      { name: 'Williamsburg', lng: -73.95, lat: 40.7303, layer: 'suburb_labels' },
    ]);
    const result = neighborhoodStrategy.candidates(makeCtx(map)) as Array<{ name: string; source: string }>;
    const names = result.map((c) => c.name);
    expect(names).toContain('Greenpoint');
    expect(names).toContain('Williamsburg');
    expect(names).not.toContain('Bloor Street');
  });

  it('returns empty when map is null', () => {
    const result = neighborhoodStrategy.candidates(makeCtx(null));
    expect(result).toEqual([]);
  });
});

describe('streetStrategy', () => {
  it('returns only road candidates', () => {
    const map = makeMap([
      { name: 'Greenpoint', lng: -73.95, lat: 40.7301, layer: 'neighborhood_labels' },
      { name: 'Bloor Street', lng: -73.95, lat: 40.7302, layer: 'road_labels' },
    ]);
    const result = streetStrategy.candidates(makeCtx(map)) as Array<{ name: string; source: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bloor Street');
    expect(result[0].source).toBe('road');
  });

  it('sorts multiple road candidates by score descending', () => {
    const map = makeMap([
      { name: 'Far Road', lng: -73.95, lat: 40.734, layer: 'road_labels' },
      { name: 'Near Road', lng: -73.95, lat: 40.7301, layer: 'road_labels' },
    ]);
    const result = streetStrategy.candidates(makeCtx(map)) as Array<{ name: string; score: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Near Road');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('returns empty when map is null', () => {
    const result = streetStrategy.candidates(makeCtx(null));
    expect(result).toEqual([]);
  });
});
