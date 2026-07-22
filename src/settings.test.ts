import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'net.mfranchi.neighborhood-station-names:enabled';

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

  it('reads a stored "true"', async () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(true);
  });

  it('reads a stored "false"', async () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(false);
  });

  it('treats an unrecognized stored value as disabled', async () => {
    localStorage.setItem(STORAGE_KEY, 'banana');
    const { isEnabled } = await loadSettings();
    expect(isEnabled()).toBe(false);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

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
});
