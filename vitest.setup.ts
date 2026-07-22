import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__subwayBuilder_storeCallbacks__;
  delete (globalThis as Record<string, unknown>).SubwayBuilderAPI;
  if (typeof window !== 'undefined') {
    delete (window as unknown as Record<string, unknown>).SubwayBuilderAPI;
  }
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
