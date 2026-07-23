import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./settings', () => ({ isEnabled: vi.fn(() => true) }));
vi.mock('./store', () => ({
  getStore: vi.fn(),
  setStationName: vi.fn(() => true),
  refreshStationName: vi.fn(() => true),
}));
vi.mock('./neighborhoods', () => ({ findNeighborhoodName: vi.fn() }));

import { applyToAllStations, resetProcessed, scheduleApplyToAllStations } from './naming';
import { isEnabled } from './settings';
import { getStore, setStationName, refreshStationName } from './store';
import { findNeighborhoodName } from './neighborhoods';
import type { ModdingAPI } from './types/api';
import type { Station } from './types/game-state';

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

function makeApi(stations: Station[] = []): ModdingAPI {
  return {
    utils: { getMap: () => ({}) },
    gameState: { getStations: () => stations },
  } as unknown as ModdingAPI;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProcessed();
  vi.mocked(isEnabled).mockReturnValue(true);
  vi.mocked(setStationName).mockReturnValue(true);
  vi.mocked(getStore).mockReturnValue(null);
  vi.mocked(findNeighborhoodName).mockReturnValue(null);
});

describe('applyToAllStations', () => {
  it('renames every unprocessed station from the store', () => {
    vi.mocked(findNeighborhoodName).mockReturnValueOnce('Greenpoint').mockReturnValueOnce('Bushwick');
    const stations = [makeStation({ id: 's1' }), makeStation({ id: 's2', trackGroupId: 'g2' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(2);
    expect(setStationName).toHaveBeenCalledTimes(2);
  });

  it('falls back to api.gameState.getStations when the store bridge is down', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    vi.mocked(getStore).mockReturnValue(null);
    const stations = [makeStation({ id: 's1' })];
    const api = makeApi(stations);

    expect(applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('returns 0 when there are no stations', () => {
    vi.mocked(getStore).mockReturnValue({ stations: [], updateStationName: vi.fn() } as never);
    expect(applyToAllStations(makeApi())).toBe(0);

    vi.mocked(getStore).mockReturnValue(null);
    expect(applyToAllStations(makeApi([]))).toBe(0);
  });

  it('skips already-processed stations unless forced', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(1);
    expect(applyToAllStations(api)).toBe(0); // processed -> skipped
    expect(applyToAllStations(api, true)).toBe(1); // force -> re-applied
    expect(setStationName).toHaveBeenCalledTimes(2);
  });

  it('only renames stations that still need it in a mixed batch', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1], updateStationName: vi.fn() } as never);
    const api = makeApi();
    applyToAllStations(api); // processes s1

    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);
    expect(applyToAllStations(api)).toBe(1); // only s2 is new
    expect(setStationName).toHaveBeenLastCalledWith('s2', 'Greenpoint');
  });

  it('assigns a neighborhood name to at most one station', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    expect(applyToAllStations(makeApi())).toBe(1); // s1 takes it; s2 keeps its road name
    expect(setStationName).toHaveBeenCalledTimes(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('blocks the same neighborhood name even across different lines', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1', routeIds: ['r1'] });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', routeIds: ['r2'] });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    expect(applyToAllStations(makeApi())).toBe(1); // uniqueness is global, not per line
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('avoids a name already assigned to another station', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1], updateStationName: vi.fn() } as never);
    const api = makeApi();
    applyToAllStations(api); // s1 -> Greenpoint (processed)
    s1.name = 'Greenpoint'; // reflect the rename in the store snapshot

    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);
    expect(applyToAllStations(api)).toBe(0); // s2 blocked by s1's name
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('reverts a pre-existing duplicate to its road name when forced', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1', name: 'Greenpoint' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', name: 'Greenpoint' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    applyToAllStations(makeApi(), true);
    expect(refreshStationName).toHaveBeenCalledTimes(1);
    expect(refreshStationName).toHaveBeenCalledWith('s2'); // the later station reverts
    expect(setStationName).not.toHaveBeenCalled(); // s1 already had the name
  });

  it('does not revert a conflicting station outside of a force re-apply', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', name: 'Greenpoint' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    applyToAllStations(makeApi()); // non-force
    expect(refreshStationName).not.toHaveBeenCalled();
  });

  it('renames nothing when the toggle is off', () => {
    vi.mocked(isEnabled).mockReturnValue(false);
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);

    expect(applyToAllStations(makeApi())).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('keeps the road name and stays eligible when no label is nearby', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue(null); // nothing nearby yet
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();

    // A label appears later (tiles loaded); the station was not marked processed.
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    expect(applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('marks a station processed without a write when it already has the name', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const stations = [makeStation({ id: 's1', name: 'Greenpoint' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(0); // already correct
    expect(setStationName).not.toHaveBeenCalled();
    expect(applyToAllStations(api)).toBe(0); // now processed, still nothing
  });

  it('leaves a station eligible when the store is not ready, so it retries', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    vi.mocked(setStationName).mockReturnValue(false); // store not ready
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(0); // write failed; not marked processed

    vi.mocked(setStationName).mockReturnValue(true);
    expect(applyToAllStations(api)).toBe(1); // retried and succeeded
  });
});

describe('resetProcessed', () => {
  it('lets a previously-processed station be re-evaluated', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(applyToAllStations(api)).toBe(1); // renamed, now processed
    expect(applyToAllStations(api)).toBe(0); // processed -> skipped

    resetProcessed();
    expect(applyToAllStations(api)).toBe(1); // eligible again
  });
});

describe('scheduleApplyToAllStations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function setupRenamableStation(): ModdingAPI {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    return makeApi();
  }

  it('does not rename synchronously (the regression the deferral fixes)', () => {
    const api = setupRenamableStation();
    scheduleApplyToAllStations(api);
    expect(setStationName).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('renames after the configured delay', () => {
    const api = setupRenamableStation();
    scheduleApplyToAllStations(api, 250);

    vi.advanceTimersByTime(249);
    expect(setStationName).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid successive calls into a single scan', () => {
    const api = setupRenamableStation();
    scheduleApplyToAllStations(api, 100);
    scheduleApplyToAllStations(api, 100);
    scheduleApplyToAllStations(api, 100);

    vi.advanceTimersByTime(100);
    // One scan -> getStore read once, station renamed once.
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown during the deferred scan', () => {
    vi.mocked(getStore).mockReturnValue(null);
    const api = {
      utils: { getMap: () => ({}) },
      gameState: {
        getStations: () => {
          throw new Error('game state exploded');
        },
      },
    } as unknown as ModdingAPI;
    const errorSpy = vi.spyOn(console, 'error');

    scheduleApplyToAllStations(api);
    expect(() => vi.advanceTimersByTime(1)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
