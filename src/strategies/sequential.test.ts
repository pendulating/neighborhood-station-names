import { describe, expect, it } from 'vitest';
import { sequentialStrategy } from './sequential';
import type { StrategyContext, NamingSettings, NameCandidate } from '../types/naming';

function makeCtx(over: Partial<StrategyContext> = {}): StrategyContext {
  const settings: NamingSettings = {
    enabled: true,
    mode: 'sequential',
    disambiguation: 'auto',
    radiusM: 500,
    sequentialFormat: 'number',
  };
  return {
    coords: [-74.0, 40.7],
    stationId: 's1',
    routeIds: ['r1'],
    map: null,
    settings,
    usedNames: new Set(),
    routeStationOrder: ['s1', 's2', 's3'],
    ...over,
  };
}

function run(ctx: StrategyContext): NameCandidate[] {
  return sequentialStrategy.candidates(ctx) as NameCandidate[];
}

describe('sequentialStrategy', () => {
  it('produces numeric names based on route position', () => {
    const result = run(makeCtx({ routeStationOrder: ['s0', 's1', 's2'] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('2');
  });

  it('produces alpha names (A, B, C)', () => {
    const result = run(makeCtx({
      settings: { ...makeCtx().settings, sequentialFormat: 'alpha' },
      routeStationOrder: ['s0', 's1', 's2'],
    }));
    expect(result[0].name).toBe('B');
  });

  it('wraps alpha past Z to AA, AB, etc.', () => {
    const order = Array.from({ length: 28 }, (_, i) => `s${i}`);
    const result26 = run(makeCtx({
      stationId: 's26',
      settings: { ...makeCtx().settings, sequentialFormat: 'alpha' },
      routeStationOrder: order,
    }));
    expect(result26[0].name).toBe('AA');

    const result27 = run(makeCtx({
      stationId: 's27',
      settings: { ...makeCtx().settings, sequentialFormat: 'alpha' },
      routeStationOrder: order,
    }));
    expect(result27[0].name).toBe('AB');
  });

  it('produces compass labels based on route position', () => {
    const order = ['s0', 's1', 's2', 's3', 's4', 's5'];

    const first = run(makeCtx({
      stationId: 's0',
      settings: { ...makeCtx().settings, sequentialFormat: 'compass' },
      routeStationOrder: order,
    }));
    expect(first[0].name).toBe('North');

    const last = run(makeCtx({
      stationId: 's5',
      settings: { ...makeCtx().settings, sequentialFormat: 'compass' },
      routeStationOrder: order,
    }));
    expect(last[0].name).toBe('South');

    const mid = run(makeCtx({
      stationId: 's3',
      settings: { ...makeCtx().settings, sequentialFormat: 'compass' },
      routeStationOrder: order,
    }));
    expect(mid[0].name).toBe('Central');
  });

  it('falls back to spatial candidates when route order is unavailable', () => {
    const result = run(makeCtx({ routeStationOrder: null, map: null }));
    expect(result).toEqual([]);
  });

  it('falls back to spatial when station is not found in route order', () => {
    const result = run(makeCtx({
      stationId: 'unknown',
      routeStationOrder: ['s0', 's1', 's2'],
      map: null,
    }));
    expect(result).toEqual([]);
  });

  it('falls back to spatial when route order is empty', () => {
    const result = run(makeCtx({ routeStationOrder: [], map: null }));
    expect(result).toEqual([]);
  });

  it('handles an unrecognised format by defaulting to numeric', () => {
    const result = run(makeCtx({
      settings: { ...makeCtx().settings, sequentialFormat: 'bogus' as never },
      routeStationOrder: ['s0', 's1'],
    }));
    expect(result[0].name).toBe('2');
  });

  it('returns Central for a single-station route in compass format', () => {
    const result = run(makeCtx({
      stationId: 's0',
      settings: { ...makeCtx().settings, sequentialFormat: 'compass' },
      routeStationOrder: ['s0'],
    }));
    expect(result[0].name).toBe('Central');
  });
});
