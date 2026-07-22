# Relevance to the Neighborhood-Naming Mod

> Curated analysis connecting the Template Mod documentation and API surface to the MVP described in
> [`../jul22-high-level-idea.md`](../jul22-high-level-idea.md). Documented facts are cited to a doc page or
> `.d.ts` file; anything not directly documented is labelled **hypothesis — verify in-game**.

## The MVP, restated

A Settings-menu **toggle** that switches station auto-naming from **road-based** (the default) to
**neighborhood-based**, using the neighborhood labels present in default and high-quality modded maps.

---

## 1. How stations are named today (documented facts)

- A `Station` has a `name: string` and `coords: Coordinate` (`[lng, lat]`) — `src/types/game-state.d.ts`,
  [07](./07-api-surface-reference.md).
- The only named-place source in a city's **data files** is `roads` — a GeoJSON whose properties are
  `RoadProperties = { roadClass, structure, name }` (`src/types/schemas.d.ts`, `cities.d.ts`). This is
  consistent with the default naming being **road-name based**.
- `CityDataFiles` = `{ buildingsIndex, demandData, roads, runwaysTaxiways?, oceanDepthIndex? }`.
  **There is no neighborhoods data file** — so neighborhood names do not come from the data pipeline the
  same way road names do.

## 2. Where neighborhood labels actually live (finding)

Neighborhood labels are baked into the **base map tiles/style**, as a **distinct symbol layer** — not the
data files. Evidence from the Subway Builder Modded site's own code and the Depot (map-pipeline) docs:

- The map style defines separate label buckets: **`neighborhoodLabel`**, `roadLabel`, and `cityLabel`
  (each with its own color/halo). Layers are classified by id: ids containing `city`/`country`/`state`
  → city labels; boundary/others → **neighborhood labels**.
- Depot (the Python tool that generates the PMTiles maps) lets map authors *"Choose which types of labels
  (e.g., cities, suburbs, towns, villages, neighborhoods) are added to the PMTiles at low, moderate, and
  high zoom levels."*

**Implication:** to get the nearest neighborhood name for a station, read it from the rendered map, not from
`CityDataFiles`.

### Accessing map label features (documented API + observed pattern)

- `api.utils.getMap()` returns the live **MapLibre `Map`** instance (`src/types/api.d.ts`).
- MapLibre's `map.queryRenderedFeatures(pointOrBbox, { layers: [...] })` / `map.querySourceFeatures(...)`
  read features from tiles. The site itself uses exactly this pattern
  (`i.queryRenderedFeatures(point, { layers: [neighborhoodLayerId] })`).
- `api.ui.getAvailableLayers()` and `api.map.setLayerOverride(...)` help discover/adjust the relevant layer.

> **Hypothesis — verify in-game:** the neighborhood label layer id / source-layer name in a loaded default
> city (e.g. NYC). Confirm by dumping `getMap().getStyle().layers` and inspecting features under the cursor.

## 3. When to apply the rename (documented hooks)

Two candidate insertion points (`src/types/api.d.ts`, [03-common-patterns](./03-common-patterns.md)):

- `hooks.onStationBuilt((station) => …)` — fires when a station is **constructed**.
- `hooks.onBlueprintPlaced((tracks) => …)` — fires when **blueprint tracks are placed** (the phase the
  idea describes: "when stations are placed in blueprint mode … the automatically-selected name").

## 4. THE KEY GAP / RISK ⚠️ (finding)

**The v1.0.0 API exposes no documented way to set/override a station's name.** There is no
`setStationName`, `renameStation`, or writable `gameState`; `gameState.*` is explicitly **read-only**
([03](./03-common-patterns.md)), and the `build`/`storage` namespaces are marked *"currently unusable at
runtime"* ([06-type-reference](./06-type-reference.md)).

So the central feasibility question for the MVP is **"can a mod change the name the game assigns to a
station?"** Options to investigate, in rough order of preference:

1. **Intercept at naming time.** If the game names stations during blueprint placement, find whether that
   naming path is patchable/overridable from mod scope (e.g. a store method on `window`).
   *Hypothesis — verify in-game.*
2. **Mutate the `Station` object** returned by `onStationBuilt`/`getStations()` and force a UI refresh
   (`api.ui.forceUpdate()`). Whether the mutation persists into game state/saves is unknown.
   *Hypothesis — verify in-game.*
3. **Undocumented internals** — `window.__subwayBuilder_storeCallbacks__` and other in-game globals
   (`src/types/index.d.ts`) may expose a setter. Reverse-engineer with care; not API-stable.

This gap should be resolved with a small spike **before** committing to the settings/UI work.

## 5. The toggle UI (documented API)

- Simplest: `api.ui.addToggle('settings-menu', { id, label, defaultValue, onChange(enabled) })`
  ([03](./03-common-patterns.md)).
- More control: `api.ui.registerComponent('settings-menu', { id, component })` rendering the game's
  `Switch` from `api.utils.components` ([04-react-components](./04-react-components.md)).
- Register UI **inside `onMapReady`** with a one-time init guard; `onMapReady` can fire repeatedly
  ([03](./03-common-patterns.md), [05-debugging](./05-debugging.md)).

## 6. Persisting the toggle (documented caveat)

`api.storage` is **Electron-only and "currently broken"** ([03](./03-common-patterns.md),
[07](./07-api-surface-reference.md)). Plan to persist the on/off state via `localStorage` (with the noted
"not sandboxed / at your own risk" caveat), and treat storage as best-effort.

## 7. Build & dev workflow essentials (documented)

From [01-getting-started](./01-getting-started.md) / [02-project-structure](./02-project-structure.md):

- `pnpm install` → `pnpm build` → `pnpm dev:link` (symlink `dist/` into the game mods folder) → enable in
  **Settings > Mods** → `pnpm dev` for watch + logging to `debug/latest.log`.
- Hot reload in-game with **Ctrl/Cmd+Shift+R** (`api.reloadMods()`); dev console **Ctrl/Cmd+Shift+I**.
- Mods folder (macOS): `~/Library/Application Support/metro-maker4/mods/`.
- `manifest.json` `main` must be `index.js`; ids are reverse-domain.
- Coordinates everywhere are `[longitude, latitude]`.
- Requires Subway Builder **v1.1.0+**, Node **v22+**, pnpm.

---

## Open questions to resolve with an in-game spike

1. **Can a mod override a station's assigned name at all?** (Section 4 — the make-or-break question.)
2. What is the neighborhood label **layer id / source-layer** in default maps, and what property holds the
   neighborhood name?
3. Does the rename need to run on `onBlueprintPlaced` (blueprint phase) or `onStationBuilt` (construction),
   and does it survive save/load?
4. Nearest-neighborhood selection strategy: point-in-polygon on a boundary layer vs. nearest label point.
5. What happens in cities/maps whose tiles include **no** neighborhood labels? (Fallback to road-based.)
