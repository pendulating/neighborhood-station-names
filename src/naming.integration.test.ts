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

import { applyToAllStations, resetProcessed, scheduleApplyToAllStations } from './naming';
import type { ModdingAPI } from './types/api';
import type { Station, Route } from './types/game-state';
import type { NameCandidate } from './types/naming';
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

function makeCandidate(name: string): NameCandidate {
  return { name, source: 'neighborhood', distanceM: 100, score: 0.8 };
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

function makeApi(stations: Station[], routes: Route[] = []): ModdingAPI {
  return {
    utils: { getMap: () => ({}), getCityCode: () => 'NYC' },
    gameState: { getStations: () => stations, getRoutes: () => routes },
  } as unknown as ModdingAPI;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetProcessed();
  mockCandidates.mockReturnValue([makeCandidate('Greenpoint')]);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('naming integration (real store bridge)', () => {
  it('a deferred rename survives the game recomputing names after the hook', async () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    scheduleApplyToAllStations(api);
    stations[0].name = 'Road St';

    expect(stations[0].name).toBe('Road St');

    await vi.advanceTimersByTimeAsync(1);

    expect(stations[0].name).toBe('Greenpoint');
  });

  it('demonstrates the hazard: a synchronous rename is clobbered', async () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    await applyToAllStations(api);
    expect(stations[0].name).toBe('Greenpoint');

    stations[0].name = 'Road St';
    expect(stations[0].name).toBe('Road St');
  });

  it('does not revert a manual rename once the mod has named a station', async () => {
    const stations = [makeStation()];
    installGameStore(stations);
    const api = makeApi(stations);

    scheduleApplyToAllStations(api);
    await vi.advanceTimersByTimeAsync(1);
    expect(stations[0].name).toBe('Greenpoint');

    stations[0].name = 'Penn Station';

    scheduleApplyToAllStations(api);
    await vi.advanceTimersByTimeAsync(1);
    expect(stations[0].name).toBe('Penn Station');
  });

  it('renames every new station in a batch after the clobber settles', async () => {
    mockCandidates
      .mockReturnValueOnce([makeCandidate('Greenpoint')])
      .mockReturnValueOnce([makeCandidate('Bushwick')]);
    const stations = [
      makeStation({ id: 's1' }),
      makeStation({ id: 's2', trackGroupId: 'g2', name: 'Other Rd' }),
    ];
    installGameStore(stations);
    const api = makeApi(stations);

    scheduleApplyToAllStations(api);
    for (const s of stations) s.name = 'Road St';

    await vi.advanceTimersByTimeAsync(1);
    expect(stations[0].name).toBe('Greenpoint');
    expect(stations[1].name).toBe('Bushwick');
  });
});