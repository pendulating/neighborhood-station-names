/**
 * Neighborhood naming strategy.
 *
 * Produces candidates from the nearest neighbourhood and suburb labels on the
 * base map. This is the original behaviour of the mod, refactored into the
 * multi-strategy pipeline.
 */

import type { NamingStrategy, StrategyContext, NameCandidate } from '../types/naming';
import { findNameCandidates } from '../spatial';

/**
 * Neighbourhood/suburb naming strategy.
 *
 * Queries the base map's vector tiles for nearby neighbourhood and suburb
 * labels, then returns them ranked by distance (closer = higher score).
 */
export const neighborhoodStrategy: NamingStrategy = {
  id: 'neighborhood',

  candidates(ctx: StrategyContext): NameCandidate[] {
    const all = findNameCandidates(ctx.map, ctx.coords, ctx.settings);
    const filtered = all.filter(
      (c): boolean => c.source === 'neighborhood' || c.source === 'suburb',
    );
    filtered.sort((a, b) => b.score - a.score);
    return filtered;
  },
};