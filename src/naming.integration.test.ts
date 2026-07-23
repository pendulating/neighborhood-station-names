import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the map lookup is mocked; the real store bridge and naming orchestration
// run, so this exercises the same write path the game uses.
vi.mock('./neighborhoods', () => ({ findNeighborhoodName: vi.fn() }));

import { applyToAllStations, resetProcessed, scheduleApplyToAllStations } from './naming';
import { findNeighborhoodName } from './neighborhoods';
import type { ModdingAPI } from './types/api';
import type { Station } from './types/game-state';
import type { MainStoreState, UpdateStationNamePayload } from './types/store';

function makeStation(over: Partial<Station> = {}): Station {
  return {
    id: 's1',
    name: 'Road St',
    coords: [-74.0, 40.7],
    trackIds: [],
    trackGroupId: 'g1',
    buildType: 'blueprint',
    stNodeIds: [],
    routeIds: [],
    createdAt: 0,
    nearbyStations: [],
    ...over,
  };
}

// A stand-in for the game's Zustand store: updateStationName mutates the live
// stations array exactly like the real action does.
function installGameStore(stations: Station[]): MainStoreState {
  const store: MainStoreState = {
    stations,
    updateStationName(id: string, payload: UpdateStationNamePayload) {
      const station = this.stations.find((s) => s.id === id);
      if (station && payload.type === 'newName') station.name = payload.newName;
    },
  };
  (globalThis as Record<string, unknown>).__subwayBuilder_storeCallbacks__ = { getState: () => store };
  return store;
}

function makeApi(stations: Station[]): ModdingAPI {
  return {
    utils: { getMap: () => ({}) },
    gameState: { getStations: () => stations },
  } as unknown as ModdingAPI;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetProcessed();
  vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('naming integration (real store bridge)', () => {
  it('a deferred rename survives the game recomputing names after the hook', () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    // setTracks fires the hook (mod schedules a deferred rename)...
    scheduleApplyToAllStations(api);
    // ...then recomputes the stations array from a stale snapshot, clobbering
    // any synchronous rename back to the road name:
    stations[0].name = 'Road St';

    // Nothing has been renamed yet — the deferral has not fired.
    expect(stations[0].name).toBe('Road St');

    vi.advanceTimersByTime(1);

    // The deferred rename is the last write, so the neighborhood name wins.
    expect(stations[0].name).toBe('Greenpoint');
  });

  it('demonstrates the hazard: a synchronous rename is clobbered', () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    applyToAllStations(api); // synchronous rename
    expect(stations[0].name).toBe('Greenpoint');

    // The game's post-hook recompute overwrites it...
    stations[0].name = 'Road St';
    expect(stations[0].name).toBe('Road St'); // ...which is exactly why we defer.
  });

  it('does not revert a manual rename once the mod has named a station', () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    scheduleApplyToAllStations(api);
    vi.advanceTimersByTime(1);
    expect(stations[0].name).toBe('Greenpoint');

    // The player renames the station by hand.
    stations[0].name = 'Penn Station';

    // A later placement triggers another deferred scan; it must not fight the player.
    scheduleApplyToAllStations(api);
    vi.advanceTimersByTime(1);
    expect(stations[0].name).toBe('Penn Station');
  });

  it('renames every new station in a batch after the clobber settles', () => {
    vi.mocked(findNeighborhoodName).mockReturnValueOnce('Greenpoint').mockReturnValueOnce('Bushwick');
    const stations = [makeStation({ id: 's1' }), makeStation({ id: 's2', trackGroupId: 'g2', name: 'Other Rd' })];
    installGameStore(stations);
    const api = makeApi(stations);

    scheduleApplyToAllStations(api);
    for (const s of stations) s.name = 'Road St'; // game clobbers the whole batch

    vi.advanceTimersByTime(1);
    expect(stations[0].name).toBe('Greenpoint');
    expect(stations[1].name).toBe('Bushwick');
  });
});
