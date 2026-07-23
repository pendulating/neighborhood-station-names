/**
 * Orchestrates neighborhood-based station naming: scan the stations in the store
 * and rename each to its nearest neighborhood/suburb label via the game's store.
 * A neighborhood/suburb name is assigned to at most one station; a station that
 * would duplicate a name already in use keeps its road-based name instead.
 */

import type { ModdingAPI } from './types/api';
import type { Station } from './types/game-state';
import { getStore, setStationName, refreshStationName } from './store';
import { findNeighborhoodName, type MaplibreLike } from './neighborhoods';
import { isEnabled } from './settings';

const TAG = '[NeighborhoodNames]';

/** Stations we've already renamed, so we never fight a user's manual rename. */
const processed = new Set<string>();

/** All stations, from the live store when available, else the API snapshot. */
function getAllStations(api: ModdingAPI): Station[] {
  const store = getStore();
  return store?.stations ?? api.gameState.getStations() ?? [];
}

/**
 * Re-scan every station and rename any not yet processed. Used on blueprint
 * placement / construction hooks and by the "rename existing stations" action.
 *
 * A neighborhood/suburb name is handed out to at most one station: uniqueness is
 * enforced globally rather than per line, because stations on a line still being
 * built have no route yet and so can't be scoped by line. When a station would
 * take a name another station already has, it keeps its road-based name (recomputed
 * via refresh when it had already been assigned the duplicate). The player is free
 * to rename stations by hand afterwards.
 *
 * @param force  when true, ignores the processed set (used by the manual button
 *               so the user can re-apply, and to undo pre-existing duplicates).
 */
export function applyToAllStations(api: ModdingAPI, force = false): number {
  if (!isEnabled()) return 0;
  const stations = getAllStations(api);
  if (stations.length === 0) return 0;

  // Neighborhood/suburb names already handed out. Seeded with the names of
  // stations we will not rename (already processed) so a name assigned earlier is
  // never given to a second station.
  const usedNames = new Set<string>();
  for (const station of stations) {
    if (force) processed.delete(station.id);
    else if (processed.has(station.id)) usedNames.add(station.name);
  }

  const map = api.utils.getMap() as unknown as MaplibreLike | null;
  let renamed = 0;
  for (const station of stations) {
    if (processed.has(station.id)) continue;

    const name = findNeighborhoodName(map, station.coords);
    if (!name) continue; // no neighborhood; keep the road name
    if (usedNames.has(name)) {
      // Another station already has this name; fall back to the road-based name.
      if (force && station.name === name) refreshStationName(station.id); // undo a prior duplicate
      continue; // left unprocessed so it can take the name if it frees up later
    }
    if (station.name === name) {
      processed.add(station.id);
      usedNames.add(name); // already correct
      continue;
    }

    if (!setStationName(station.id, name)) continue; // store not ready; retry later
    console.log(`${TAG} "${station.name}" -> "${name}" (${station.id})`);
    usedNames.add(name);
    processed.add(station.id);
    renamed++;
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
