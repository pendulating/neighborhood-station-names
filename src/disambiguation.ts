/**
 * Name collision resolution via compass qualifiers, hyphenated merges, and
 * sequential fallback numbering.
 *
 * When two stations would otherwise share the same name, this module produces
 * a unique variant using the user's chosen disambiguation style.
 */

import type { Coordinate } from './types/core';
import type { NameCandidate, DisambiguationStyle } from './types/naming';
import { haversineMeters } from './spatial';

export interface DisambiguationOptions {
  /** The name that is already taken by another station. */
  takenName: string;
  /** Coordinates of the station being named. */
  stationCoords: Coordinate;
  /** Centroid of the map feature (label) that produced the candidate name. */
  featureCoords: Coordinate;
  /** Ranked candidates from the spatial gatherer (may be empty). */
  candidates: NameCandidate[];
  /** The disambiguation strategy to use. */
  style: DisambiguationStyle;
  /** Names already assigned to other stations on this line. */
  usedNames: ReadonlySet<string>;
  /** Starting index for sequential numbering (defaults to 2). */
  sequentialIndex?: number;
}

/**
 * Produce a unique name for a station whose top candidate is already taken.
 *
 * - **compass**: Computes the bearing from the map label centroid to the
 *   station, then prefixes with the compass direction ("S Whitehall").
 *   Falls through to sequential if the prefixed name is also taken.
 * - **hyphen**: Picks the best candidate from a different source layer and
 *   joins the two names with an en-dash ("Greenpoint–McCarren Park").
 *   Falls through to sequential if no second candidate is available.
 * - **sequential**: Appends a number starting from `sequentialIndex`
 *   ("Greenpoint 2", "Greenpoint 3", ...).
 * - **auto**: Tries compass first; if taken, falls back to hyphen; if hyphen
 *   is unavailable or also taken, falls back to sequential.
 */
export function disambiguate(opts: DisambiguationOptions): string | null {
  const { style } = opts;

  if (style === 'compass') {
    return disambiguateCompass(opts) ?? disambiguateSequential(opts);
  }
  if (style === 'hyphen') {
    return disambiguateHyphen(opts) ?? disambiguateSequential(opts);
  }
  if (style === 'sequential') {
    return disambiguateSequential(opts);
  }
  // auto
  const compassResult = disambiguateCompass(opts);
  if (compassResult !== null && !opts.usedNames.has(compassResult)) {
    return compassResult;
  }
  const hyphenResult = disambiguateHyphen(opts);
  if (hyphenResult !== null && !opts.usedNames.has(hyphenResult)) {
    return hyphenResult;
  }
  return disambiguateSequential(opts);
}

function disambiguateCompass(opts: DisambiguationOptions): string | null {
  const distM = haversineMeters(opts.featureCoords, opts.stationCoords);

  // Station is essentially on top of the label — compass bearing is meaningless.
  if (distM < 15) {
    const centered = `${opts.takenName} Center`;
    return opts.usedNames.has(centered) ? null : centered;
  }

  const bearing = bearingDegrees(opts.featureCoords, opts.stationCoords);
  const label = compassLabel(bearing);
  const prefixed = `${label} ${opts.takenName}`;
  if (!opts.usedNames.has(prefixed)) {
    return prefixed;
  }
  return null;
}

function disambiguateHyphen(opts: DisambiguationOptions): string | null {
  if (opts.candidates.length === 0) return null;

  for (const candidate of opts.candidates) {
    if (candidate.name !== opts.takenName && candidate.source !== 'suburb') {
      const merged = `${opts.takenName}\u2013${candidate.name}`;
      if (!opts.usedNames.has(merged)) {
        return merged;
      }
    }
  }

  return null;
}

function disambiguateSequential(opts: DisambiguationOptions): string {
  const n = opts.sequentialIndex ?? 2;
  let candidate = `${opts.takenName} ${n}`;
  let offset = 1;
  while (opts.usedNames.has(candidate)) {
    candidate = `${opts.takenName} ${n + offset}`;
    offset++;
  }
  return candidate;
}

export function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const toDeg = (rad: number): number => (rad * 180) / Math.PI;

  const [lng1, lat1] = from;
  const [lng2, lat2] = to;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

export function compassLabel(bearing: number): string {
  const deg = ((bearing % 360) + 360) % 360;

  const sectors: [string, number, number][] = [
    ['N', 337.5, 360],
    ['N', 0, 22.5],
    ['NE', 22.5, 67.5],
    ['E', 67.5, 112.5],
    ['SE', 112.5, 157.5],
    ['S', 157.5, 202.5],
    ['SW', 202.5, 247.5],
    ['W', 247.5, 292.5],
    ['NW', 292.5, 337.5],
  ];

  for (const [label, lo, hi] of sectors) {
    if (deg >= lo && deg < hi) return label;
  }

  return 'N';
}