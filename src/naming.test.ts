import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./settings', () => ({ isEnabled: vi.fn(() => true) }));
vi.mock('./store', () => ({ getStore: vi.fn(), setStationName: vi.fn(() => true) }));
vi.mock('./neighborhoods', () => ({ findNeighborhoodName: vi.fn() }));

import {
  applyNeighborhoodName,
  applyToAllStations,
  resetProcessed,
  scheduleApplyToAllStations,
} from './naming';
import { isEnabled } from './settings';
import { getStore, setStationName } from './store';
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

describe('applyNeighborhoodName', () => {
  it('does nothing when the toggle is off', () => {
    vi.mocked(isEnabled).mockReturnValue(false);
    const api = makeApi();
    expect(applyNeighborhoodName(api, makeStation())).toBe(false);
    expect(findNeighborhoodName).not.toHaveBeenCalled();
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('ignores a missing station', () => {
    const api = makeApi();
    expect(applyNeighborhoodName(api, undefined as unknown as Station)).toBe(false);
    expect(findNeighborhoodName).not.toHaveBeenCalled();
  });

  it('leaves the name and retries later when no neighborhood is found', () => {
    const api = makeApi();
    const station = makeStation();

    expect(applyNeighborhoodName(api, station)).toBe(false);
    expect(setStationName).not.toHaveBeenCalled();

    // A later sighting (tiles loaded) should now succeed: it was not marked processed.
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    expect(applyNeighborhoodName(api, station)).toBe(true);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('renames a station and marks it processed', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const api = makeApi();

    expect(applyNeighborhoodName(api, makeStation())).toBe(true);
    expect(setStationName).toHaveBeenCalledTimes(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');

    // Second call is a no-op: we never fight a name we already own (or a manual rename).
    expect(applyNeighborhoodName(api, makeStation())).toBe(false);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('treats an already-matching name as processed without a store write', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const api = makeApi();
    const station = makeStation({ name: 'Greenpoint' });

    expect(applyNeighborhoodName(api, station)).toBe(false);
    expect(setStationName).not.toHaveBeenCalled();

    // Marked processed: a second call short-circuits before even querying the map.
    expect(applyNeighborhoodName(api, station)).toBe(false);
    expect(findNeighborhoodName).toHaveBeenCalledTimes(1);
  });

  it('does not mark processed when the store is not ready, so it retries', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    vi.mocked(setStationName).mockReturnValue(false);
    const api = makeApi();
    const station = makeStation();

    expect(applyNeighborhoodName(api, station)).toBe(false);

    vi.mocked(setStationName).mockReturnValue(true);
    expect(applyNeighborhoodName(api, station)).toBe(true);
    expect(setStationName).toHaveBeenCalledTimes(2);
  });
});

describe('applyToAllStations', () => {
  it('renames every unprocessed station from the store', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
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
});

describe('resetProcessed', () => {
  it('lets a previously-processed station be re-evaluated', () => {
    vi.mocked(findNeighborhoodName).mockReturnValue('Greenpoint');
    const api = makeApi();
    const station = makeStation();

    expect(applyNeighborhoodName(api, station)).toBe(true);
    expect(applyNeighborhoodName(api, station)).toBe(false);

    resetProcessed();
    expect(applyNeighborhoodName(api, station)).toBe(true);
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
