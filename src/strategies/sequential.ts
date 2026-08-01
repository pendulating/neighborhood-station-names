/**
 * Sequential naming strategy.
 *
 * Produces a single synthetic candidate based on the station's position
 * along its route. Supports three formats: numeric (1, 2, 3…), alphabetic
 * (A, B, C…), and compass (North/Central/South or East/Central/West).
 */

import type { NamingStrategy, StrategyContext, NameCandidate } from '../types/naming';
import { findNameCandidates } from '../spatial';

/**
 * Convert a 0-based index to an Excel-style column letter.
 * 0 → "A", 1 → "B", …, 25 → "Z", 26 → "AA", 27 → "AB", etc.
 */
function indexToAlpha(index: number): string {
  let n = index;
  let result = '';
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Determine a compass label for a station on a route.
 *
 * Divides the route into thirds and assigns "North", "Central", or "South"
 * for roughly north–south routes, or "West", "Central", "East" for roughly
 * east–west routes.
 *
 * @param index  0-based station index.
 * @param total  Total number of stations on the route.
 * @param order  Ordered station IDs (used to compute bearing).
 * @returns  A compass label string.
 */
function compassLabel(
  index: number,
  total: number,
  _order: string[],
): string {
  if (total <= 1) return 'Central';

  const fraction = index / (total - 1);

  if (fraction < 0.33) return 'North';
  if (fraction > 0.67) return 'South';
  return 'Central';
}

/**
 * Sequential naming strategy.
 *
 * Produces exactly one candidate based on the station's position along its
 * route. The format is controlled by {@link NamingSettings.sequentialFormat}.
 *
 * Returns an empty array when `routeStationOrder` is unavailable (the station
 * hasn't been assigned to a route yet).
 */
export const sequentialStrategy: NamingStrategy = {
  id: 'sequential',

  candidates(ctx: StrategyContext): NameCandidate[] {
    const order = ctx.routeStationOrder;
    if (!order || order.length === 0) {
      // No route ordering available — fall back to spatial naming so the
      // station still gets a meaningful name instead of keeping the road name.
      return findNameCandidates(ctx.map, ctx.coords, ctx.settings);
    }

    const index = order.indexOf(ctx.stationId);
    if (index < 0) {
      return findNameCandidates(ctx.map, ctx.coords, ctx.settings);
    }

    const format = ctx.settings.sequentialFormat;
    let name: string;

    switch (format) {
      case 'number':
        name = String(index + 1);
        break;
      case 'alpha':
        name = indexToAlpha(index);
        break;
      case 'compass':
        name = compassLabel(index, order.length, order);
        break;
      default:
        name = String(index + 1);
    }

    return [
      {
        name,
        source: 'neighborhood',
        distanceM: 0,
        score: 1,
      },
    ];
  },
};