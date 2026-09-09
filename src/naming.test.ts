import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCandidates = vi.fn<() => NameCandidate[]>(() => []);

vi.mock('./strategies', () => ({
  getStrategy: vi.fn(() => ({
    id: 'neighborhood' as const,
    candidates: mockCandidates,
  })),
}));

vi.mock('./disambiguation', () => ({
  disambiguate: vi.fn(() => null),
}));

vi.mock('./settings', () => ({
  getSettings: vi.fn(() => ({
    enabled: true,
    mode: 'neighborhood' as const,
    disambiguation: 'auto' as const,
    radiusM: 500,
    sequentialFormat: 'number' as const,
  })),
  updateSettings: vi.fn(),
  isEnabled: vi.fn(() => true),
  setEnabled: vi.fn(),
}));

vi.mock('./store', () => ({
  getStore: vi.fn(),
  setStationName: vi.fn(() => true),
  refreshStationName: vi.fn(() => true),
}));

import {
  applyToAllStations,
  initializeProcessedStations,
  resetProcessed,
  scheduleApplyToAllStations,
} from './naming';
import { getSettings } from './settings';
import { getStore, setStationName, refreshStationName } from './store';
import type { ModdingAPI } from './types/api';
import type { Station, Route } from './types/game-state';
import type { NameCandidate } from './types/naming';

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

function makeCandidate(name: string): NameCandidate {
  return { name, source: 'neighborhood', distanceM: 100, score: 0.8 };
}

function makeApi(stations: Station[] = [], routes: Route[] = []): ModdingAPI {
  return {
    utils: { getMap: () => ({}), getCityCode: () => 'NYC' },
    gameState: { getStations: () => stations, getRoutes: () => routes },
  } as unknown as ModdingAPI;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProcessed();
  vi.mocked(getSettings).mockReturnValue({
    enabled: true,
    mode: 'neighborhood',
    disambiguation: 'auto',
    radiusM: 500,
    sequentialFormat: 'number',
  });
  vi.mocked(setStationName).mockReturnValue(true);
  vi.mocked(getStore).mockReturnValue(null);
  mockCandidates.mockReturnValue([]);
});

describe('applyToAllStations', () => {
  it('renames every unprocessed station from the store', async () => {
    mockCandidates
      .mockReturnValueOnce([makeCandidate('Greenpoint')])
      .mockReturnValueOnce([makeCandidate('Bushwick')]);
    const stations = [makeStation({ id: 's1' }), makeStation({ id: 's2', trackGroupId: 'g2' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(2);
    expect(setStationName).toHaveBeenCalledTimes(2);
  });

  it('falls back to api.gameState.getStations when the store bridge is down', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    vi.mocked(getStore).mockReturnValue(null);
    const stations = [makeStation({ id: 's1' })];
    const api = makeApi(stations);

    expect(await applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('returns 0 when there are no stations', async () => {
    vi.mocked(getStore).mockReturnValue({ stations: [], updateStationName: vi.fn() } as never);
    expect(await applyToAllStations(makeApi())).toBe(0);

    vi.mocked(getStore).mockReturnValue(null);
    expect(await applyToAllStations(makeApi([]))).toBe(0);
  });

  it('skips already-processed stations unless forced', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(1);
    expect(await applyToAllStations(api)).toBe(0);
    expect(await applyToAllStations(api, true)).toBe(1);
    expect(setStationName).toHaveBeenCalledTimes(2);
  });

  it('only renames stations that still need it in a mixed batch', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1], updateStationName: vi.fn() } as never);
    const api = makeApi();
    await applyToAllStations(api);

    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);
    expect(await applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenLastCalledWith('s2', 'Greenpoint');
  });

  it('assigns a name to at most one station', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    expect(await applyToAllStations(makeApi())).toBe(1);
    expect(setStationName).toHaveBeenCalledTimes(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('blocks the same name even across different lines', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1', routeIds: ['r1'] });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', routeIds: ['r2'] });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    expect(await applyToAllStations(makeApi())).toBe(1);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('avoids a name already assigned to another station', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1], updateStationName: vi.fn() } as never);
    const api = makeApi();
    await applyToAllStations(api);
    s1.name = 'Greenpoint';

    const s2 = makeStation({ id: 's2', trackGroupId: 'g2' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);
    expect(await applyToAllStations(api)).toBe(0);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('reverts a pre-existing duplicate to its road name when forced', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1', name: 'Greenpoint' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', name: 'Greenpoint' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    await applyToAllStations(makeApi(), true);
    expect(refreshStationName).toHaveBeenCalledTimes(1);
    expect(refreshStationName).toHaveBeenCalledWith('s2');
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('does not revert a conflicting station outside of a force re-apply', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const s1 = makeStation({ id: 's1' });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', name: 'Greenpoint' });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);

    await applyToAllStations(makeApi());
    expect(refreshStationName).not.toHaveBeenCalled();
  });

  it('renames nothing when the toggle is off', async () => {
    vi.mocked(getSettings).mockReturnValue({
      enabled: false,
      mode: 'neighborhood',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);

    expect(await applyToAllStations(makeApi())).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('keeps the road name and stays eligible when no candidates are available', async () => {
    mockCandidates.mockReturnValueOnce([]).mockReturnValueOnce([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();

    expect(await applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('marks a station processed without a write when it already has the name', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1', name: 'Greenpoint' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();
    expect(await applyToAllStations(api)).toBe(0);
  });

  it('leaves a station eligible when the store is not ready, so it retries', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    vi.mocked(setStationName).mockReturnValue(false);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(0);

    vi.mocked(setStationName).mockReturnValue(true);
    expect(await applyToAllStations(api)).toBe(1);
  });
});

describe('resetProcessed', () => {
  it('lets a previously-processed station be re-evaluated', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(1);
    expect(await applyToAllStations(api)).toBe(0);

    resetProcessed();
    expect(await applyToAllStations(api)).toBe(1);
  });
});

describe('initializeProcessedStations', () => {
  it('preserves a manually overridden name after a map reload', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const station = makeStation({ id: 's1', name: 'My Custom Name' });
    vi.mocked(getStore).mockReturnValue({
      stations: [station],
      updateStationName: vi.fn(),
    } as never);
    const api = makeApi();

    // onMapReady seeds all stations loaded from the save before automatic
    // placement/construction hooks are allowed to scan the map.
    initializeProcessedStations(api);

    expect(await applyToAllStations(api)).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('still names stations created after the map-load baseline', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const existing = makeStation({ id: 's1', name: 'My Custom Name' });
    const stations = [existing];
    vi.mocked(getStore).mockReturnValue({
      stations,
      updateStationName: vi.fn(),
    } as never);
    const api = makeApi();

    initializeProcessedStations(api);
    stations.push(makeStation({ id: 's2', trackGroupId: 'g2' }));

    expect(await applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledOnce();
    expect(setStationName).toHaveBeenCalledWith('s2', 'Greenpoint');
  });
});

describe('settings changes do not rename existing stations', () => {
  it('changing mode without force leaves already-named stations untouched', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
    vi.mocked(setStationName).mockClear();

    vi.mocked(getSettings).mockReturnValue({
      enabled: true,
      mode: 'street',
      disambiguation: 'auto',
      radiusM: 800,
      sequentialFormat: 'number',
    });
    mockCandidates.mockReturnValue([makeCandidate('Broadway')]);

    expect(await applyToAllStations(api)).toBe(0);
    expect(setStationName).not.toHaveBeenCalled();
  });

  it('force re-apply picks up the new settings for existing stations', async () => {
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    const api = makeApi();

    await applyToAllStations(api);
    vi.mocked(setStationName).mockClear();

    vi.mocked(getSettings).mockReturnValue({
      enabled: true,
      mode: 'street',
      disambiguation: 'auto',
      radiusM: 800,
      sequentialFormat: 'number',
    });
    mockCandidates.mockReturnValue([makeCandidate('Broadway')]);

    expect(await applyToAllStations(api, true)).toBe(1);
    expect(setStationName).toHaveBeenCalledWith('s1', 'Broadway');
  });
});

describe('sequential mode route ordering', () => {
  it('passes route station order to the strategy context in sequential mode', async () => {
    vi.mocked(getSettings).mockReturnValue({
      enabled: true,
      mode: 'sequential',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    mockCandidates
      .mockReturnValueOnce([makeCandidate('1')])
      .mockReturnValueOnce([makeCandidate('2')]);
    const s1 = makeStation({ id: 's1', routeIds: ['r1'] });
    const s2 = makeStation({ id: 's2', trackGroupId: 'g2', routeIds: ['r1'] });
    vi.mocked(getStore).mockReturnValue({ stations: [s1, s2], updateStationName: vi.fn() } as never);
    const routes: Route[] = [{ id: 'r1', stations: [{ id: 's1' }, { id: 's2' }] }] as unknown as Route[];
    const api = makeApi([], routes);

    expect(await applyToAllStations(api)).toBe(2);
  });

  it('handles a station with no route gracefully in sequential mode', async () => {
    vi.mocked(getSettings).mockReturnValue({
      enabled: true,
      mode: 'sequential',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    mockCandidates.mockReturnValue([makeCandidate('1')]);
    const s1 = makeStation({ id: 's1', routeIds: [] });
    vi.mocked(getStore).mockReturnValue({ stations: [s1], updateStationName: vi.fn() } as never);
    const api = makeApi();

    expect(await applyToAllStations(api)).toBe(1);
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
    mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
    const stations = [makeStation({ id: 's1' })];
    vi.mocked(getStore).mockReturnValue({ stations, updateStationName: vi.fn() } as never);
    return makeApi();
  }

  it('does not rename synchronously (the regression the deferral fixes)', async () => {
    const api = setupRenamableStation();
    const promise = scheduleApplyToAllStations(api);
    expect(setStationName).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await promise;
    expect(setStationName).toHaveBeenCalledWith('s1', 'Greenpoint');
  });

  it('renames after the configured delay', async () => {
    const api = setupRenamableStation();
    const promise = scheduleApplyToAllStations(api, 250);

    vi.advanceTimersByTime(249);
    expect(setStationName).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await promise;
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid successive calls into a single scan', async () => {
    const api = setupRenamableStation();
    scheduleApplyToAllStations(api, 100);
    scheduleApplyToAllStations(api, 100);
    const promise = scheduleApplyToAllStations(api, 100);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    await promise;
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(setStationName).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown during the deferred scan', async () => {
    vi.mocked(getStore).mockReturnValue(null);
    const api = {
      utils: { getMap: () => ({}), getCityCode: () => 'NYC' },
      gameState: {
        getStations: () => {
          throw new Error('game state exploded');
        },
        getRoutes: () => [],
      },
    } as unknown as ModdingAPI;
    const errorSpy = vi.spyOn(console, 'error');

    const promise = scheduleApplyToAllStations(api);
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await promise;
    expect(errorSpy).toHaveBeenCalled();
  });
});
