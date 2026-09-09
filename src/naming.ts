/**
 * Orchestrates station naming via the active strategy: consult the strategy
 * for candidates, pick the best, and disambiguate on collision.  A name is
 * assigned to at most one station; a station that would duplicate a name
 * already in use keeps its road-based name unless disambiguation succeeds.
 */

import type { ModdingAPI } from './types/api';
import type { Station, Route } from './types/game-state';
import type { MaplibreLike, StrategyContext, NameCandidate } from './types/naming';
import { getStore, setStationName, refreshStationName } from './store';
import { getSettings } from './settings';
import { getStrategy } from './strategies';
import { disambiguate } from './disambiguation';
import type { DisambiguationOptions } from './disambiguation';

const TAG = '[NeighborhoodNames]';

/**
 * Stations that already existed when the current map loaded, or that this mod
 * has considered since then. Keeping them here prevents automatic hook scans
 * from fighting a user's manual rename.
 */
const processed = new Set<string>();

/** All stations, from the live store when available, else the API snapshot. */
function getAllStations(api: ModdingAPI): Station[] {
  const store = getStore();
  return store?.stations ?? api.gameState.getStations() ?? [];
}

/**
 * Treat every station already present on a freshly loaded map as processed.
 *
 * Station names are saved by the game, including manual overrides. The
 * processed set is intentionally session-local, so it must be seeded whenever
 * a map loads; otherwise the next placement hook would mistake every loaded
 * station for a new one and overwrite its saved name.
 */
export function initializeProcessedStations(api: ModdingAPI): void {
  processed.clear();
  for (const station of getAllStations(api)) {
    processed.add(station.id);
  }
}

/**
 * Build the ordered list of station IDs for the route that a station belongs to.
 * Returns null when the route has no stations array or the route is not found.
 */
function computeRouteOrder(
  station: Station,
  routes: Route[],
): string[] | null {
  const primaryRouteId = station.routeIds[0];
  if (!primaryRouteId) return null;
  const route = routes.find((r) => r.id === primaryRouteId);
  if (!route?.stations || route.stations.length === 0) return null;
  return route.stations.map((s) => s.id);
}

/**
 * Build a {@link StrategyContext} for a single station.
 */
function buildContext(
  station: Station,
  map: MaplibreLike | null,
  usedNames: ReadonlySet<string>,
  routes: Route[],
): StrategyContext {
  const settings = getSettings();
  const routeStationOrder =
    settings.mode === 'sequential'
      ? computeRouteOrder(station, routes)
      : undefined;

  return {
    coords: station.coords,
    stationId: station.id,
    routeIds: station.routeIds,
    map,
    settings,
    usedNames,
    routeStationOrder,
  };
}

/**
 * Re-scan every station and rename any not yet processed. Used on blueprint
 * placement / construction hooks and by the "rename existing stations" action.
 *
 * A neighborhood/suburb/landmark name is handed out to at most one station:
 * uniqueness is enforced globally. When a station would take a name another
 * station already has, the orchestrator runs disambiguation. If that also
 * collides, the station keeps its road-based name (recomputed via refresh when
 * it had already been assigned the duplicate). The player is free to rename
 * stations by hand afterwards.
 *
 * @param force  When true, ignores the processed set (used by the manual button
 *               so the user can re-apply, and to undo pre-existing duplicates).
 */
export async function applyToAllStations(
  api: ModdingAPI,
  force = false,
): Promise<number> {
  const settings = getSettings();
  if (!settings.enabled) return 0;
  const stations = getAllStations(api);
  if (stations.length === 0) return 0;

  const usedNames = new Set<string>();
  for (const station of stations) {
    if (force) processed.delete(station.id);
    else if (processed.has(station.id)) usedNames.add(station.name);
  }

  const map = api.utils.getMap() as unknown as MaplibreLike | null;
  const strategy = getStrategy(settings.mode);
  const routes = api.gameState.getRoutes();

  let renamed = 0;
  for (const station of stations) {
    if (processed.has(station.id)) continue;

    const ctx = buildContext(station, map, usedNames, routes);

    const candidates: NameCandidate[] = await strategy.candidates(ctx);

    if (candidates.length === 0) continue;

    // Pick the top candidate whose name is not already used.
    let chosenName: string | null = null;
    for (const candidate of candidates) {
      if (!usedNames.has(candidate.name)) {
        chosenName = candidate.name;
        break;
      }
    }

    // All candidates collided — try disambiguation with the top candidate.
    if (chosenName === null) {
      const top = candidates[0];
      const disambigOpts: DisambiguationOptions = {
        takenName: top.name,
        stationCoords: station.coords,
        featureCoords: top.featureCoords ?? station.coords,
        candidates,
        style: settings.disambiguation,
        usedNames,
      };
      const disambiguated = disambiguate(disambigOpts);
      if (disambiguated !== null && !usedNames.has(disambiguated)) {
        chosenName = disambiguated;
      }
    }

    if (chosenName === null) {
      // No usable name — ensure the station keeps its road name.
      if (force) refreshStationName(station.id);
      continue; // left unprocessed so it can take the name if it frees up later
    }

    if (station.name === chosenName) {
      processed.add(station.id);
      usedNames.add(chosenName); // already correct
      continue;
    }

    if (!setStationName(station.id, chosenName)) continue; // store not ready; retry later
    console.log(`${TAG} "${station.name}" -> "${chosenName}" (${station.id})`);
    usedNames.add(chosenName);
    processed.add(station.id);
    renamed++;
  }
  return renamed;
}

/** Forget all processed stations. Exported for isolated state reset in tests. */
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

/**
 * Schedule a deferred application of station naming. Debounces rapid calls.
 *
 * @param api   The Modding API instance.
 * @param delay Delay in milliseconds before applying (default 0 = next tick).
 */
export async function scheduleApplyToAllStations(
  api: ModdingAPI,
  delay = 0,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (applyTimer !== null) clearTimeout(applyTimer);
    applyTimer = setTimeout(async () => {
      applyTimer = null;
      try {
        await applyToAllStations(api);
      } catch (err) {
        console.error(`${TAG} Error in deferred naming:`, err);
      } finally {
        resolve();
      }
    }, delay);
  });
}
