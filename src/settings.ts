/**
 * Mod settings with best-effort persistence.
 *
 * The Modding API's `storage` namespace is Electron-only and currently broken,
 * so we persist the full settings object in `localStorage` (documented workaround).
 * Falls back to DEFAULT_SETTINGS when localStorage is unavailable or corrupted.
 */

import { type NamingSettings, DEFAULT_SETTINGS } from './types/naming';

const STORAGE_KEY = 'neighborhood-station-names:settings';

/** In-memory cache of the merged settings. */
let cached: NamingSettings | null = null;

/**
 * Load settings from localStorage, merging with defaults for any missing keys.
 * Returns DEFAULT_SETTINGS when localStorage is unavailable or corrupted.
 */
function loadSettings(): NamingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }
    const stored = parsed as Record<string, unknown>;
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_SETTINGS.enabled,
      mode: typeof stored.mode === 'string' ? stored.mode as NamingSettings['mode'] : DEFAULT_SETTINGS.mode,
      disambiguation:
        typeof stored.disambiguation === 'string'
          ? stored.disambiguation as NamingSettings['disambiguation']
          : DEFAULT_SETTINGS.disambiguation,
      radiusM: typeof stored.radiusM === 'number' ? stored.radiusM : DEFAULT_SETTINGS.radiusM,
      sequentialFormat:
        typeof stored.sequentialFormat === 'string'
          ? stored.sequentialFormat as NamingSettings['sequentialFormat']
          : DEFAULT_SETTINGS.sequentialFormat,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist the current settings to localStorage (best-effort). */
function persist(settings: NamingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* persistence is best-effort */
  }
}

/**
 * Return the current merged settings (defaults + stored overrides).
 * The result is a fresh object — mutations are harmless.
 */
export function getSettings(): NamingSettings {
  if (cached === null) {
    cached = loadSettings();
  }
  return { ...cached };
}

/**
 * Merge a partial update into the stored settings and persist immediately.
 * Invalidates the in-memory cache so the next {@link getSettings} returns the
 * new values.
 */
export function updateSettings(partial: Partial<NamingSettings>): void {
  const current = getSettings();
  const next: NamingSettings = { ...current, ...partial };
  cached = next;
  persist(next);
}

/**
 * Whether neighborhood-based naming is currently active.
 * Backwards-compatible with the old single-boolean API.
 */
export function isEnabled(): boolean {
  return getSettings().enabled;
}

/**
 * Update the master toggle and persist it.
 * Backwards-compatible with the old single-boolean API.
 */
export function setEnabled(value: boolean): void {
  updateSettings({ enabled: value });
}