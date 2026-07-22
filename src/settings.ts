/**
 * Mod settings with best-effort persistence.
 *
 * The Modding API's `storage` namespace is Electron-only and currently broken,
 * so we persist the single toggle in `localStorage` (documented workaround).
 */

const STORAGE_KEY = 'neighborhood-station-names:enabled';

let enabled = loadEnabled();

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Default ON: the whole point of installing the mod is neighborhood naming.
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

/** Whether neighborhood-based naming is currently active. */
export function isEnabled(): boolean {
  return enabled;
}

/** Update the toggle and persist it. */
export function setEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* persistence is best-effort */
  }
}
