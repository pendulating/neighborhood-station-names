/**
 * Access to the game's internal main store.
 *
 * The public Modding API has no station-rename method, but the game exposes its
 * Zustand store via `globalThis.__subwayBuilder_storeCallbacks__.getState()` — the
 * same store the in-game rename box mutates. This module wraps that access.
 */

import type { MainStoreState, UpdateStationNamePayload } from './types/store';

/** Returns the live main store state, or null if the bridge isn't ready yet. */
export function getStore(): MainStoreState | null {
  const bridge = globalThis.__subwayBuilder_storeCallbacks__;
  if (!bridge || typeof bridge.getState !== 'function') return null;
  try {
    const state = bridge.getState();
    return state && typeof state.updateStationName === 'function' ? state : null;
  } catch {
    return null;
  }
}

/**
 * Rename a station via the store (identical to the in-game rename box).
 * Returns true if the call was dispatched.
 */
export function setStationName(stationId: string, newName: string): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.updateStationName(stationId, { type: 'newName', newName } satisfies UpdateStationNamePayload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recompute a station's default road-based name (what the in-game refresh button
 * calls). Used to revert a station to its road name when keeping its neighborhood
 * name would duplicate another station on the same line.
 */
export function refreshStationName(stationId: string): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.updateStationName(stationId, { type: 'refresh' } satisfies UpdateStationNamePayload);
    return true;
  } catch {
    return false;
  }
}
