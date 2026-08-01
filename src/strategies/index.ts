/**
 * Strategy registry.
 *
 * Maps {@link NamingMode} values to their corresponding {@link NamingStrategy}
 * implementations. The orchestrator calls {@link getStrategy} to resolve the
 * active strategy.
 */

import type { NamingMode, NamingStrategy } from '../types/naming';
import { neighborhoodStrategy } from './neighborhood';
import { streetStrategy } from './street';
import { sequentialStrategy } from './sequential';

/**
 * All naming strategies in registration order.
 * Useful for testing, enumeration, and validation.
 */
export const ALL_STRATEGIES: readonly NamingStrategy[] = [
  neighborhoodStrategy,
  streetStrategy,
  sequentialStrategy,
] as const;

const strategyMap = new Map<NamingMode, NamingStrategy>(
  ALL_STRATEGIES.map((s): [NamingMode, NamingStrategy] => [s.id, s]),
);

/**
 * Resolve a naming mode to its strategy implementation.
 *
 * @param mode  The naming mode to look up.
 * @returns  The matching {@link NamingStrategy}, or the neighbourhood strategy
 *           as a safe default if the mode is unrecognised.
 */
export function getStrategy(mode: NamingMode): NamingStrategy {
  return strategyMap.get(mode) ?? neighborhoodStrategy;
}