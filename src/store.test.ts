import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStore, setStationName } from './store';
import type { StoreCallbacks } from './types/store';

function installBridge(bridge: unknown): void {
  (globalThis as Record<string, unknown>).__subwayBuilder_storeCallbacks__ = bridge;
}

describe('getStore', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__subwayBuilder_storeCallbacks__;
  });

  it('returns null when the bridge is not registered', () => {
    expect(getStore()).toBeNull();
  });

  it('returns null when getState is not a function', () => {
    installBridge({ getState: 'nope' });
    expect(getStore()).toBeNull();
  });

  it('returns null when getState throws', () => {
    installBridge({
      getState: () => {
        throw new Error('store not ready');
      },
    });
    expect(getStore()).toBeNull();
  });

  it('returns null when the state has no updateStationName action', () => {
    installBridge({ getState: () => ({ stations: [] }) });
    expect(getStore()).toBeNull();
  });

  it('returns the live store state when valid', () => {
    const state = { stations: [], updateStationName: vi.fn() };
    installBridge({ getState: () => state } satisfies StoreCallbacks);
    expect(getStore()).toBe(state);
  });
});

describe('setStationName', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__subwayBuilder_storeCallbacks__;
  });

  it('returns false when the store is unavailable', () => {
    expect(setStationName('s1', 'Greenpoint')).toBe(false);
  });

  it('dispatches a newName payload identical to the in-game rename box', () => {
    const updateStationName = vi.fn();
    installBridge({ getState: () => ({ stations: [], updateStationName }) });

    expect(setStationName('s1', 'Greenpoint')).toBe(true);
    expect(updateStationName).toHaveBeenCalledTimes(1);
    expect(updateStationName).toHaveBeenCalledWith('s1', { type: 'newName', newName: 'Greenpoint' });
  });

  it('returns false (without throwing) when the store action throws', () => {
    installBridge({
      getState: () => ({
        stations: [],
        updateStationName: () => {
          throw new Error('write failed');
        },
      }),
    });
    expect(setStationName('s1', 'Greenpoint')).toBe(false);
  });
});
