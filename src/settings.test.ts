import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./types/naming', () => ({
  DEFAULT_SETTINGS: {
    enabled: true,
    mode: 'neighborhood',
    disambiguation: 'auto',
    radiusM: 500,
    sequentialFormat: 'number',
  },
}));

const STORAGE_KEY = 'neighborhood-station-names:settings';

const realLocalStorage = globalThis.localStorage;

// settings.ts reads localStorage once at module load and caches the result, so
// each test resets the module registry and re-imports after arranging storage.
async function loadSettings() {
  vi.resetModules();
  return await import('./settings');
}

// happy-dom's localStorage is a Proxy that does not survive vi.spyOn cleanly, so
// error-path tests swap the whole global for a stub and restore it afterwards.
function installStorageStub(overrides: Record<string, unknown> = {}) {
  const stub = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
    ...overrides,
  };
  (globalThis as Record<string, unknown>).localStorage = stub;
}

function setStored(settings: Record<string, unknown>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).localStorage = realLocalStorage;
  });

  it('defaults to enabled when nothing is stored', async () => {
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
  });

  it('reads a stored enabled=true', async () => {
    setStored({ enabled: true });
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
  });

  it('reads a stored enabled=false', async () => {
    setStored({ enabled: false });
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(false);
  });

  it('treats a corrupted stored value as default (enabled)', async () => {
    localStorage.setItem(STORAGE_KEY, 'banana');
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
  });

  it('defaults to enabled when reading storage throws', async () => {
    installStorageStub({
      getItem: () => {
        throw new Error('storage unavailable');
      },
    });
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
  });

  it('persists the toggle so a later load sees it', async () => {
    const first = await loadSettings();
    first.setEnabled(false);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.enabled).toBe(false);

    const second = await loadSettings();
    expect(second.isEnabled()).toBe(false);
  });

  it('updates the in-memory value immediately on setEnabled', async () => {
    const { isEnabled, setEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
    setEnabled(false);
    expect(isEnabled()).toBe(false);
    setEnabled(true);
    expect(isEnabled()).toBe(true);
  });

  it('swallows write errors (persistence is best-effort)', async () => {
    installStorageStub({
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    const { isEnabled, setEnabled } = await loadSettings();
    expect(() => setEnabled(false)).not.toThrow();
    expect(isEnabled()).toBe(false);
  });

  it('getSettings returns the full settings object', async () => {
    setStored({ enabled: true, mode: 'street', radiusM: 800 });
    const { getSettings } = await loadSettings();
    const settings = getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.mode).toBe('street');
    expect(settings.radiusM).toBe(800);
    expect(settings.disambiguation).toBe('auto'); // default
  });

  it('updateSettings merges partial updates', async () => {
    const { updateSettings, getSettings } = await loadSettings();
    updateSettings({ mode: 'sequential', radiusM: 300 });
    const settings = getSettings();
    expect(settings.mode).toBe('sequential');
    expect(settings.radiusM).toBe(300);
    expect(settings.enabled).toBe(true); // unchanged
  });

  it('updateSettings persists the merged object', async () => {
    const { updateSettings } = await loadSettings();
    updateSettings({ mode: 'sequential', radiusM: 200 });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.mode).toBe('sequential');
    expect(stored.radiusM).toBe(200);
    expect(stored.enabled).toBe(true);
  });

  it('degrades gracefully when stored mode is a removed value (e.g. landmark)', async () => {
    setStored({ enabled: true, mode: 'landmark', radiusM: 500 });
    const { getSettings } = await loadSettings();
    const settings = getSettings();
    expect(settings.mode).toBe('landmark');
    expect(settings.enabled).toBe(true);
    expect(settings.radiusM).toBe(500);
  });
});