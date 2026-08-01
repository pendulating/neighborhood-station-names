/**
 * Shared types for the multi-strategy station naming system.
 *
 * Every module in the naming pipeline imports from here. The type contract
 * is intentionally small and stable — strategies, spatial lookup, and
 * disambiguation all speak this vocabulary.
 */

import type { Coordinate } from './core';

// =============================================================================
// NAMING MODES & SETTINGS
// =============================================================================

/**
 * The naming strategy the user has selected.
 *
 * - `neighborhood`: nearest neighborhood/suburb label (original behavior)
 * - `street`: nearest road label or computed cross-street pair
 * - `sequential`: line-position-based numbering or compass progression (opt-in)
 */
export type NamingMode = 'neighborhood' | 'street' | 'sequential';

/**
 * How to disambiguate when the top candidate name is already taken.
 *
 * - `compass`: compute bearing from the station that holds the name → "East X"
 * - `hyphen`: merge top two candidates from different sources → "X–Y"
 * - `sequential`: append a number or letter → "X 2" / "X B"
 * - `auto`: try compass first, then hyphen, then sequential (default)
 */
export type DisambiguationStyle = 'compass' | 'hyphen' | 'sequential' | 'auto';

/**
 * Format for sequential naming mode.
 *
 * - `number`: "Station 7" or just "7"
 * - `compass`: relative position along line bearing → "North", "Central", "South"
 * - `alpha`: "A", "B", "C"
 */
export type SequentialFormat = 'number' | 'compass' | 'alpha';

/** The full settings object, persisted to localStorage. */
export interface NamingSettings {
  /** Master toggle — when off, the mod does nothing. */
  enabled: boolean;
  /** Which naming strategy to use. */
  mode: NamingMode;
  /** How to resolve name collisions. */
  disambiguation: DisambiguationStyle;
  /** Search radius in metres for spatial queries (default 300). */
  radiusM: number;
  /** Format for sequential mode. */
  sequentialFormat: SequentialFormat;
}

/** Sensible defaults for a fresh install. */
export const DEFAULT_SETTINGS: NamingSettings = {
  enabled: true,
  mode: 'neighborhood',
  disambiguation: 'auto',
  radiusM: 300,
  sequentialFormat: 'number',
};

// =============================================================================
// NAME CANDIDATES
// =============================================================================

/** Where a name candidate came from. */
export type CandidateSource =
  | 'neighborhood'
  | 'suburb'
  | 'road'
  | 'water'
  | 'park';

/**
 * A scored name candidate for a station. Strategies produce these; the
 * orchestrator picks the best one and disambiguates on collision.
 */
export interface NameCandidate {
  /** The display name (e.g. "Greenpoint", "Bloor Street", "Prospect Park"). */
  name: string;
  /** Which layer/source produced this candidate. */
  source: CandidateSource;
  /** Distance in metres from the station to the label/feature centroid. */
  distanceM: number;
  /**
   * Composite score: higher is better. Computed as
   * `layerWeight[source] × (1 - distanceM / maxRadius)`.
   * Strategies may apply additional adjustments.
   */
  score: number;
  /** Centroid of the map feature that produced this candidate (for compass disambiguation). */
  featureCoords?: Coordinate;
}

// =============================================================================
// STRATEGY INTERFACE
// =============================================================================

/**
 * Context passed to every naming strategy. Contains everything a strategy
 * needs to produce candidates for a single station.
 */
export interface StrategyContext {
  /** Station coordinates [lng, lat]. */
  coords: Coordinate;
  /** Station ID (for sequential mode: ordering along a route). */
  stationId: string;
  /** Route IDs this station belongs to (for sequential mode). */
  routeIds: string[];
  /** The MapLibre-like map instance for tile queries (may be null). */
  map: MaplibreLike | null;
  /** Current naming settings. */
  settings: NamingSettings;
  /**
   * Names already assigned to other stations. Strategies can use this to
   * avoid producing a candidate that will certainly collide.
   */
  usedNames: ReadonlySet<string>;
  /**
   * For sequential mode: the ordered list of station IDs on the same route,
   * or null if route ordering is unavailable.
   */
  routeStationOrder?: string[] | null;
}

/**
 * A naming strategy produces ranked candidates for a station.
 * The orchestrator calls the active strategy, picks the top candidate,
 * and runs disambiguation if it collides with a used name.
 */
export interface NamingStrategy {
  /** Human-readable strategy name (for logging/UI). */
  readonly id: NamingMode;

  /**
   * Produce ranked name candidates for a station.
   * Returns [] if nothing qualifies (caller keeps the road-based name).
   */
  candidates(ctx: StrategyContext): Promise<NameCandidate[]> | NameCandidate[];
}

// =============================================================================
// MAPLIBRE STRUCTURAL TYPES (shared)
// =============================================================================

/** Minimal structural type for the bits of MapLibre we use. */
export interface MaplibreLike {
  querySourceFeatures(sourceId: string, params: { sourceLayer?: string; filter?: unknown[] }): MapFeature[];
  getSource?(id: string): unknown;
}

export interface MapFeature {
  geometry?: {
    type: string;
    coordinates: unknown;
  };
  properties?: { name?: unknown; class?: unknown; subclass?: unknown; [key: string]: unknown };
}
