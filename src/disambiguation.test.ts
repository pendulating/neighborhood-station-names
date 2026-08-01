import { describe, expect, it } from 'vitest';
import { disambiguate, bearingDegrees, compassLabel } from './disambiguation';
import type { DisambiguationOptions } from './disambiguation';
import type { NameCandidate } from './types/naming';

function makeOpts(over: Partial<DisambiguationOptions> = {}): DisambiguationOptions {
  return {
    takenName: 'Whitehall',
    stationCoords: [-74.013, 40.70],
    featureCoords: [-74.013, 40.71],
    candidates: [],
    style: 'compass',
    usedNames: new Set(['Whitehall']),
    ...over,
  };
}

function makeCandidate(name: string, source: NameCandidate['source'] = 'neighborhood'): NameCandidate {
  return { name, source, distanceM: 100, score: 0.8 };
}

describe('bearingDegrees', () => {
  it('returns ~180 for a point due south', () => {
    const bearing = bearingDegrees([-74.0, 40.71], [-74.0, 40.70]);
    expect(bearing).toBeCloseTo(180, 0);
  });

  it('returns ~0 for a point due north', () => {
    const bearing = bearingDegrees([-74.0, 40.70], [-74.0, 40.71]);
    expect(bearing).toBeCloseTo(0, 0);
  });

  it('returns ~90 for a point due east', () => {
    const bearing = bearingDegrees([-74.01, 40.7], [-74.00, 40.7]);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it('returns ~270 for a point due west', () => {
    const bearing = bearingDegrees([-74.00, 40.7], [-74.01, 40.7]);
    expect(bearing).toBeCloseTo(270, 0);
  });
});

describe('compassLabel', () => {
  it.each([
    [0, 'N'], [10, 'N'], [350, 'N'],
    [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ])('maps %i° to %s', (deg, expected) => {
    expect(compassLabel(deg)).toBe(expected);
  });
});

describe('disambiguate (compass)', () => {
  it('prefixes S when the station is south of the label', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toBe('S Whitehall');
  });

  it('prefixes N when the station is north of the label', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.72],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toBe('N Whitehall');
  });

  it('prefixes E when the station is east of the label', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.00, 40.71],
      featureCoords: [-74.02, 40.71],
    }));
    expect(result).toBe('E Whitehall');
  });

  it('always prefixes, never suffixes', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toMatch(/^[A-Z]{1,2} Whitehall$/);
  });

  it('uses Center suffix when station is on top of the label (< 15m)', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.71],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toBe('Whitehall Center');
  });

  it('uses Center suffix for near-zero distance (a few metres)', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.01301, 40.71001],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toBe('Whitehall Center');
  });

  it('falls through to sequential when the prefixed name is also taken', () => {
    const result = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
      usedNames: new Set(['Whitehall', 'S Whitehall']),
    }));
    expect(result).toBe('Whitehall 2');
  });

  it('two stations on the same side: first gets compass, second falls to sequential', () => {
    const first = disambiguate(makeOpts({
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
      usedNames: new Set(['Whitehall']),
    }));
    expect(first).toBe('S Whitehall');

    const second = disambiguate(makeOpts({
      stationCoords: [-74.014, 40.699],
      featureCoords: [-74.013, 40.71],
      usedNames: new Set(['Whitehall', 'S Whitehall']),
    }));
    expect(second).toBe('Whitehall 2');
  });
});

describe('disambiguate (auto)', () => {
  it('tries compass first', () => {
    const result = disambiguate(makeOpts({
      style: 'auto',
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
    }));
    expect(result).toBe('S Whitehall');
  });

  it('falls back to hyphen when compass is taken', () => {
    const result = disambiguate(makeOpts({
      style: 'auto',
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
      usedNames: new Set(['Whitehall', 'S Whitehall']),
      candidates: [makeCandidate('Whitehall'), makeCandidate('Battery Park', 'park')],
    }));
    expect(result).toBe('Whitehall\u2013Battery Park');
  });

  it('falls back to sequential when compass and hyphen are unavailable', () => {
    const result = disambiguate(makeOpts({
      style: 'auto',
      stationCoords: [-74.013, 40.70],
      featureCoords: [-74.013, 40.71],
      usedNames: new Set(['Whitehall', 'S Whitehall']),
      candidates: [],
    }));
    expect(result).toBe('Whitehall 2');
  });
});

describe('disambiguate (sequential)', () => {
  it('appends incrementing numbers', () => {
    const result = disambiguate(makeOpts({
      style: 'sequential',
      usedNames: new Set(['Whitehall', 'Whitehall 2']),
    }));
    expect(result).toBe('Whitehall 3');
  });
});
