/**
 * Neighborhood Station Names
 *
 * Names stations after the nearest neighborhood label (from the base map's
 * `general-tiles` vector source) instead of the default nearby-road name.
 *
 * How it works:
 *  - A toggle in Settings turns neighborhood naming on/off (persisted locally).
 *  - When blueprint tracks are placed (and again when stations are built), we
 *    look up the nearest neighborhood label for each new station and rename it
 *    via the game's own store action — the same one the in-game rename box uses.
 */

import { isEnabled, setEnabled } from './settings';
import { applyToAllStations, resetProcessed, scheduleApplyToAllStations } from './naming';

const MOD_ID = 'neighborhood-station-names';
const MOD_VERSION = '0.1.0';
const TAG = '[NeighborhoodNames]';

const api = window.SubwayBuilderAPI;

if (!api) {
  console.error(`${TAG} SubwayBuilderAPI not found!`);
} else {
  console.log(`${TAG} v${MOD_VERSION} | API v${api.version}`);

  // onMapReady can fire multiple times (e.g. switching cities). Guard setup.
  let initialized = false;

  api.hooks.onMapReady(() => {
    if (initialized) return;
    initialized = true;

    try {
      // --- Settings toggle -------------------------------------------------
      api.ui.addToggle('settings-menu', {
        id: `${MOD_ID}.enabled`,
        label: 'Name stations by neighborhood',
        defaultValue: isEnabled(),
        onChange: (value) => {
          setEnabled(value);
          resetProcessed();
          api.ui.showNotification(
            value ? 'Neighborhood naming on' : 'Neighborhood naming off',
            'info',
          );
          // Applying to existing stations when turned on is opt-in via the button.
        },
      });

      // --- "Rename existing stations" action -------------------------------
      api.ui.addButton('settings-menu', {
        id: `${MOD_ID}.rename-existing`,
        label: 'Rename existing stations by neighborhood',
        onClick: () => {
          if (!isEnabled()) {
            api.ui.showNotification('Turn on neighborhood naming first.', 'warning');
            return;
          }
          const count = applyToAllStations(api, /* force */ true);
          api.ui.showNotification(
            count > 0 ? `Renamed ${count} station${count === 1 ? '' : 's'}.` : 'No stations renamed.',
            count > 0 ? 'success' : 'info',
          );
        },
      });

      // --- Rename on placement / construction ------------------------------
      // The game recomputes station names *after* these hooks fire (see
      // scheduleApplyToAllStations), so the rename is deferred to run last.
      api.hooks.onBlueprintPlaced(() => {
        scheduleApplyToAllStations(api);
      });

      // Safety net: catch stations built directly or placed before the mod loaded.
      api.hooks.onStationBuilt(() => {
        scheduleApplyToAllStations(api);
      });

      console.log(`${TAG} Initialized (naming ${isEnabled() ? 'on' : 'off'}).`);
    } catch (err) {
      console.error(`${TAG} Failed to initialize:`, err);
      api.ui.showNotification('Neighborhood Station Names failed to load. Check console.', 'error');
    }
  });
}
