/**
 * Orchestrates neighborhood-based station naming: for a given station, look up
 * the nearest neighborhood label and apply it via the store.
 */

import type { ModdingAPI } from './types/api';
import type { Station } from './types/game-state';
import { getStore, setStationName } from './store';
import { findNeighborhoodName, type MaplibreLike } from './neighborhoods';
import { isEnabled } from './settings';

const TAG = '[NeighborhoodNames]';

/** Stations we've already renamed, so we never fight a user's manual rename. */
const processed = new Set<string>();

/**
 * Rename a single station to its nearest neighborhood, if the toggle is on and a
 * neighborhood is found. Returns true only if the name was actually changed.
 */
export function applyNeighborhoodName(api: ModdingAPI, station: Station): boolean {
  if (!isEnabled()) return false;
  if (!station || processed.has(station.id)) return false;

  const map = api.utils.getMap() as unknown as MaplibreLike | null;
  const name = findNeighborhoodName(map, station.coords);
  if (!name) return false; // leave the existing road-based name; try again if seen later

  // Avoid a redundant store write if the name already matches.
  if (station.name === name) {
    processed.add(station.id);
    return false;
  }

  const ok = setStationName(station.id, name);
  if (!ok) return false; // store not ready — don't mark processed, retry later

  console.log(`${TAG} "${station.name}" -> "${name}" (${station.id})`);
  processed.add(station.id);
  return true;
}

/**
 * Re-scan every station in the store and rename any not yet processed. Used on
 * blueprint placement / construction hooks (which don't hand us the station list
 * directly) and by the "rename existing stations" action.
 *
 * @param force  when true, ignores the processed set (used by the manual button
 *               so the user can re-apply after toggling the setting on).
 */
export function applyToAllStations(api: ModdingAPI, force = false): number {
  const store = getStore();
  const stations = store?.stations ?? api.gameState.getStations();
  if (!stations || stations.length === 0) return 0;

  let renamed = 0;
  for (const station of stations) {
    if (force) processed.delete(station.id);
    if (applyNeighborhoodName(api, station)) renamed++;
  }
  return renamed;
}

/** Forget all processed stations (e.g. when the toggle flips) so they re-evaluate. */
export function resetProcessed(): void {
  processed.clear();
}

/**
 * The game's `setTracks` fires `onBlueprintPlaced`/`onStationBuilt` *before* it
 * recomputes the stations array from a stale snapshot and writes it back, which
 * clobbers any rename done synchronously inside the hook. Deferring to a macrotask
 * guarantees we run after that write settles, so our rename is the last one. The
 * debounce coalesces rapid successive placements into a single scan.
 */
let applyTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleApplyToAllStations(api: ModdingAPI, delay = 0): void {
  if (applyTimer !== null) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    try {
      applyToAllStations(api);
    } catch (err) {
      console.error(`${TAG} Error in deferred naming:`, err);
    }
  }, delay);
}
