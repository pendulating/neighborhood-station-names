/**
 * Street naming strategy.
 *
 * Produces candidates from the nearest road labels on the base map. A station
 * on a major road or at a distinctive intersection gets a street-based name
 * (e.g. "Bloor Street", "Broadway").
 */

import type { NamingStrategy, StrategyContext, NameCandidate } from '../types/naming';
import { findNameCandidates } from '../spatial';

/**
 * Road-label naming strategy.
 *
 * Queries the base map's vector tiles for nearby road labels and returns
 * them ranked by distance (closer = higher score).
 */
export const streetStrategy: NamingStrategy = {
  id: 'street',

  candidates(ctx: StrategyContext): NameCandidate[] {
    const all = findNameCandidates(ctx.map, ctx.coords, ctx.settings);
    const filtered = all.filter((c): boolean => c.source === 'road');
    filtered.sort((a, b) => b.score - a.score);
    return filtered;
  },
};