/**
 * Neighborhood Station Names
 *
 * Names stations after the nearest neighborhood label (from the base map's
 * `general-tiles` vector source), street name, or sequential position
 * — depending on the selected naming strategy.
 *
 * How it works:
 *  - A grouped settings section lets the player choose the naming mode,
 *    disambiguation style, and search radius.
 *  - When blueprint tracks are placed (and again when stations are built), we
 *    look up the best name candidate for each new station and rename it via the
 *    game's own store action — the same one the in-game rename box uses.
 */

import { getSettings, updateSettings } from './settings';
import {
  applyToAllStations,
  initializeProcessedStations,
  scheduleApplyToAllStations,
} from './naming';
import type { NamingMode, DisambiguationStyle } from './types/naming';

// Injected at build time from manifest.json (see vite.config.ts).
declare const __MOD_VERSION__: string;

const MOD_ID = 'neighborhood-station-names';
const MOD_VERSION = __MOD_VERSION__;
const TAG = '[NeighborhoodNames]';

const api = window.SubwayBuilderAPI;

if (!api) {
  console.error(`${TAG} SubwayBuilderAPI not found!`);
} else {
  console.log(`${TAG} v${MOD_VERSION} | API v${api.version}`);

  // onMapReady can fire multiple times (e.g. switching cities). Guard setup.
  let initialized = false;

  api.hooks.onMapReady(() => {
    try {
      // The game persists station names. Seed the session-local processed set
      // on every map load so saved/manual names are never mistaken for newly
      // placed stations by the next automatic hook scan.
      initializeProcessedStations(api);

      if (initialized) return;
      initialized = true;

      const settings = getSettings();

      // =====================================================================
      // Settings UI group
      // =====================================================================

      // --- Section separator ---
      api.ui.addSeparator('settings-menu', {
        id: `${MOD_ID}.section-start`,
      });

      // --- Section header ---
      api.ui.addText('settings-menu', {
        id: `${MOD_ID}.header`,
        text: 'Station Naming',
      });

      // --- Master toggle ---
      api.ui.addToggle('settings-menu', {
        id: `${MOD_ID}.enabled`,
        label: 'Name stations by neighborhood',
        defaultValue: settings.enabled,
        onChange: (value: boolean) => {
          updateSettings({ enabled: value });
          // Enabling naming affects future stations only. The explicit
          // "Rename existing stations" button remains the opt-in bulk action.
          initializeProcessedStations(api);
          api.ui.showNotification(
            value ? 'Station naming on' : 'Station naming off',
            'info',
          );
        },
      });

      // --- Naming mode selector ---
      const modeOptions: { value: NamingMode; label: string }[] = [
        { value: 'neighborhood', label: 'Neighborhood' },
        { value: 'street', label: 'Street' },
        { value: 'sequential', label: 'Sequential' },
      ];

      /**
       * Register (or re-register) the mode select with the current stored value.
       * The game's settings menu re-mounts components on open, reading
       * `defaultValue` fresh — so we must re-register after each change to
       * prevent the stale closure value from overriding the user's selection.
       */
      function registerModeSelect(): void {
        api.ui.unregisterComponent('settings-menu', `${MOD_ID}.mode`);
        api.ui.addSelect('settings-menu', {
          id: `${MOD_ID}.mode`,
          label: 'Naming mode',
          options: modeOptions,
          defaultValue: getSettings().mode,
          onChange: (value: string) => {
            updateSettings({ mode: value as NamingMode });
            // A mode change must not retroactively rewrite existing or
            // manually edited station names.
            initializeProcessedStations(api);
            registerModeSelect();
            api.ui.showNotification(
              `Naming mode: ${modeOptions.find((o) => o.value === value)?.label ?? value}`,
              'info',
            );
          },
        });
      }
      registerModeSelect();

      // --- Disambiguation style selector ---
      const disambigOptions: { value: DisambiguationStyle; label: string }[] = [
        { value: 'auto', label: 'Auto' },
        { value: 'compass', label: 'Compass' },
        { value: 'hyphen', label: 'Hyphen' },
        { value: 'sequential', label: 'Sequential' },
      ];

      function registerDisambigSelect(): void {
        api.ui.unregisterComponent('settings-menu', `${MOD_ID}.disambiguation`);
        api.ui.addSelect('settings-menu', {
          id: `${MOD_ID}.disambiguation`,
          label: 'When names collide',
          options: disambigOptions,
          defaultValue: getSettings().disambiguation,
          onChange: (value: string) => {
            updateSettings({ disambiguation: value as DisambiguationStyle });
            registerDisambigSelect();
            api.ui.showNotification(
              `Disambiguation: ${disambigOptions.find((o) => o.value === value)?.label ?? value}`,
              'info',
            );
          },
        });
      }
      registerDisambigSelect();

      // --- Search radius slider ---
      api.ui.addSlider('settings-menu', {
        id: `${MOD_ID}.radius`,
        label: 'Search radius (m)',
        min: 100,
        max: 1000,
        step: 50,
        defaultValue: settings.radiusM,
        onChange: (value: number) => {
          updateSettings({ radiusM: value });
          api.ui.showNotification(
            `Search radius: ${value} m`,
            'info',
          );
        },
      });

      // --- Rename existing stations button ---
      api.ui.addButton('settings-menu', {
        id: `${MOD_ID}.rename-existing`,
        label: 'Rename existing stations',
        onClick: () => {
          const currentSettings = getSettings();
          if (!currentSettings.enabled) {
            api.ui.showNotification('Turn on station naming first.', 'warning');
            return;
          }
          void applyToAllStations(api, /* force */ true).then((count) => {
            api.ui.showNotification(
              count > 0
                ? `Renamed ${count} station${count === 1 ? '' : 's'}.`
                : 'No stations renamed.',
              count > 0 ? 'success' : 'info',
            );
          });
        },
      });

      // =====================================================================
      // Automatic renaming on placement / construction
      // =====================================================================

      // The game recomputes station names *after* these hooks fire (see
      // scheduleApplyToAllStations), so the rename is deferred to run last.
      api.hooks.onBlueprintPlaced(() => {
        void scheduleApplyToAllStations(api);
      });

      // Safety net: catch stations built directly or placed before the mod loaded.
      api.hooks.onStationBuilt(() => {
        void scheduleApplyToAllStations(api);
      });

      console.log(
        `${TAG} Initialized (mode: ${settings.mode}, naming ${settings.enabled ? 'on' : 'off'}).`,
      );
    } catch (err) {
      console.error(`${TAG} Failed to initialize:`, err);
      api.ui.showNotification(
        'Neighborhood Station Names failed to load. Check console.',
        'error',
      );
    }
  });
}
