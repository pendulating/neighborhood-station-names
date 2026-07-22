# API Surface Reference (`window.SubwayBuilderAPI`)

> **Source:** the installed template's TypeScript definitions in `src/types/*.d.ts` (Modding API **v1.0.0**).
> This is the authoritative, complete surface — the site's [Type Reference](./06-type-reference.md) page is a
> simplified subset (and even strikes through `build`/`storage` as "listed but currently unusable at runtime").
> Where a namespace matters to the neighborhood-naming MVP it is flagged **[relevant]**; see
> [08-relevance-to-neighborhood-naming.md](./08-relevance-to-neighborhood-naming.md) for the full analysis.

The global entry point is `window.SubwayBuilderAPI: ModdingAPI`. `api.version` holds the API version string.

---

## Namespace map

| Namespace | Purpose | Relevant to MVP? |
| --- | --- | --- |
| `hooks` | Register callbacks for game lifecycle & entity events | **Yes** — station placement events |
| `ui` | Add panels, buttons, toggles, sliders, selects; notifications; theming; layer visibility | **Yes** — settings-menu toggle |
| `gameState` | Read-only accessors for stations, routes, tracks, trains, demand, metrics | **Yes** — `getStations()` |
| `actions` | Mutate money / pause / speed / ticket price / bonds | No |
| `map` | Register/override map sources, layers, styles, tiles; query driving routes | **Maybe** — layer overrides / feature access |
| `utils` | `getMap()` (MapLibre instance), React, icons, components, charts, i18n, city data loading | **Yes** — `getMap()` for tile features |
| `cities` | Register cities/tabs, set city data file URLs | Context — where road/building data comes from |
| `storage` | Persistent key-value (Electron only) — **currently broken**, see notes | **Yes (caveat)** — persisting the toggle |
| `build` | Programmatic blueprint/route/train construction — **listed but unusable at runtime** | No |
| `stations` / `trains` | Register custom station/train *types* | No |
| `career` | Register missions | No |
| `popTiming` | Commute time ranges | No |
| `content-templates` | Newspaper / tweet templates | No |
| `schemas` | Zod schemas for city data files | Context |

Top-level methods: `registerCity()`, `modifyConstants()`, `registerNewspaperTemplates()`,
`registerTweetTemplates()`, `reloadMods()`.

---

## `hooks` — lifecycle & entity events **[relevant]**

All hooks are `api.hooks.onX(callback)`. Full list with callback signatures:

| Hook | Callback args | Notes |
| --- | --- | --- |
| `onGameInit` | — | Engine initialized |
| `onMapReady` | `map: maplibregl.Map` | Map ready; **fires multiple times** (guard against re-init) |
| `onCityLoad` | `cityCode: string` | A city is loaded |
| `onDayChange` | `day: number` | Start of each in-game day |
| `onStationBuilt` | `station: Station` | **A station is constructed** |
| `onStationDeleted` | `stationId: string` | |
| `onBlueprintPlaced` | `tracks: Track[]` | **Blueprint tracks placed on the map** (pre-construction) |
| `onTrackBuilt` | `tracks: Track[]` | Tracks constructed from blueprints |
| `onTrackChange` | `changeType: 'add' \| 'delete', count: number` | |
| `onRouteCreated` | `route: Route` | |
| `onRouteDeleted` | `routeId: string, routeBullet: string` | |
| `onTrainSpawned` | `train: Train` | |
| `onTrainDeleted` | `trainId: string, routeId: string` | |
| `onDemandChange` | `popCount: number` | |
| `onPauseChanged` | `isPaused: boolean` | |
| `onSpeedChanged` | `newSpeed: GameSpeed` | |
| `onMoneyChanged` | `newBalance, change, type: 'revenue'\|'expense', category?` | |
| `onGameSaved` | `saveName: string` | |
| `onGameLoaded` | `saveName: string` | |
| `onWarning` | `message: string` | |
| `onError` | `error: string` | |
| `onGameEnd` | — | |

> `onStationBuilt` and `onBlueprintPlaced` are the two candidate insertion points for renaming logic.
> **Note:** the API exposes no documented `setStationName` / `renameStation` — see the relevance doc for this gap.

---

## `ui` — components & controls **[relevant]**

**Placements** (`UIPlacement`): `'settings-menu'`, `'escape-menu'`, `'escape-menu-buttons'`,
`'main-menu'`, `'menu-items'`, `'pause-menu'`, `'bottom-bar'`, `'top-bar'`, `'debug-panel'`, `'debug'`.

**Component registration**
- `registerComponent(placement, { id, component })` — mount an arbitrary React component at a placement.
- `unregisterComponent(placement, id)`, `getComponents(placement)`, `forceUpdate(placement?)`.

**Primitives** — `addButton`, `addToggle`, `addSlider`, `addSelect`, `addText`, `addSeparator`
(each takes `(placement, options)`). Toggle options: `{ id, label, defaultValue?, onChange(enabled) }`.
Select options: `{ id, label, options: {value,label}[], defaultValue, onChange(value) }`.

**Styled variants** — `addStyledButton`, `addStyledToggle`, `addStyledSlider`, `addMainMenuButton`.

**Toolbar & panels** — `addToolbarButton`, `addToolbarPanel`, `addFloatingPanel`
(`{ id, title?, icon?, defaultWidth?, defaultHeight?, defaultPosition?, render }`). Icons are Lucide PascalCase names.

**Notifications** — `showNotification(message, type?)` where type is `'success'|'error'|'info'|'warning'`.

**Theme** — `setTheme`, `getTheme`, `getResolvedTheme`, `setAccentColor`, `setPrimaryColor`,
`setCSSVariable`, `resetColors`.

**Map layer visibility** — `getAvailableLayers()`, `getLayerVisibility(id)`, `setLayerVisibility(id, visible)`,
`getAllLayerVisibility()`, `setMultipleLayerVisibility(record)`.

> For the MVP toggle: either `addToggle('settings-menu', {...})` (simplest) or
> `registerComponent('settings-menu', { component })` rendering a game `Switch` (more control).

---

## `gameState` — read-only accessors **[relevant]**

`getStations(): Station[]`, `getRoutes()`, `getTracks()`, `getTrains()`, `getDemandData()`,
`getCurrentDay()`, `getCurrentHour()`, `getElapsedSeconds()`, `getBudget()`, `getTicketPrice()`,
`getGameSpeed()`, `isPaused()`, `getBonds()`, `getBondTypes()`, `getRidershipStats()`,
`getLineMetrics()`, `getModeChoiceStats()`, `getCompletedCommutes()`,
`getStationRidership(stationId?)`, `getRouteRidership(routeId?)`, `calculateBlueprintCost(tracks)`.

### Key entity types

```ts
interface Station {
  id: string;
  name: string;              // <-- the auto-selected station name
  coords: Coordinate;        // [longitude, latitude]
  trackIds: string[];
  trackGroupId: string;
  buildType: BuildType;      // 'constructed' | 'blueprint'
  stNodeIds: string[];
  routeIds: string[];
  createdAt: number;
  nearbyStations: { stationId: string; walkingTime: number }[];
}

type Coordinate = [longitude: number, latitude: number];
type BoundingBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];
type BuildType = 'constructed' | 'blueprint';
```

`Track`, `Train`, `Route` are also fully typed (see `src/types/game-state.d.ts`). `Route` carries
`bullet`, `color`, `stations`, `stNodes`, etc.

---

## `map` — sources, layers, overrides, routing

- `registerSource(id, config)` / `registerLayer(config)` / `registerStyle(styleUrl)`.
  `MapSource` supports `'raster' | 'vector' | 'geojson'`. `MapLayer` supports
  `'fill' | 'line' | 'symbol' | 'circle' | 'raster' | 'fill-extrusion'`, with `source-layer`, `paint`,
  `layout`, `filter`.
- `setTileURLOverride({ cityCode, tilesUrl, foundationTilesUrl, maxZoom })`.
- `setLayerOverride({ layerId, sourceLayer?, filter?, paint? })` — override paint/filter/source-layer of an
  existing layer.
- `setDefaultLayerVisibility(cityCode, visibility)` / `getDefaultLayerVisibility(cityCode)` —
  `DefaultLayerVisibility` keys: `buildingFoundations, oceanFoundations, trackElevations, trains, stations, routes, arrows, signals`.
- Routing: `setRoutingServiceOverride`, `getRoutingServiceOverride`, `queryRoute(cityCode, origin, dest)`.

> Neighborhood labels are a **base-map symbol layer** (see relevance doc). `setLayerOverride` /
> `getAvailableLayers` and the MapLibre instance from `utils.getMap()` are the tools for inspecting them.

---

## `utils` — runtime helpers **[relevant]**

- `getMap(): maplibregl.Map | null` — **the live MapLibre instance**; use its
  `queryRenderedFeatures(point|bbox, { layers })` / `querySourceFeatures(...)` to read label features
  (this is exactly how the Subway Builder Modded site reads map features).
- `getCityCode(): string`, `getCities(): City[]`, `getConstants(): GameConstants`.
- `loadCityData(path): Promise<unknown>` — use instead of `fetch()` for Electron compatibility.
- `React` (the runtime React instance), `icons` (Lucide, PascalCase), `components` (game UI: `Button`,
  `Card*`, `Switch`, `Slider`, `Label`, `Input`, `Badge`, `Progress`, `Tooltip*`, `SubwayButton`,
  `MainMenuButton`), `charts` (Recharts), `i18n` (`I18nAPI`).

---

## `cities` & city data — context

- `cities.setCityDataFiles(cityCode, files)` / `getCityDataFiles(cityCode)`.
- `CityDataFiles`: `{ buildingsIndex, demandData, roads, runwaysTaxiways?, oceanDepthIndex? }`.
- **There is no `neighborhoods` file in `CityDataFiles`.** The only named-place source in the *data* files is
  `roads` (GeoJSON with `RoadProperties = { roadClass, structure, name }`) — this is the source the default
  road-based naming draws from. Neighborhood labels live in the base map **tiles/style**, not these files.

---

## `storage` — persistence (with a big caveat) **[relevant]**

```ts
storage.set(key, value): Promise<void>;
storage.get<T>(key, defaultValue?): Promise<T>;
storage.delete(key): Promise<void>;
storage.keys(): Promise<string[]>;
```

- **Electron (desktop) only.** In the browser build these are no-ops (`set` does nothing, `get` returns the
  default, `keys` returns `[]`).
- The Common Patterns doc explicitly warns: *"Mod-level storage is currently broken."* Workarounds are
  `localStorage` or game-level Electron storage, "at your own risk" (not sandboxed; can conflict with other
  mods). Plan the toggle's persistence accordingly.

---

## Also present (not needed for the MVP)

- `actions`: `addMoney`, `subtractMoney`, `setMoney`, `setPause`, `setSpeed`, `setTicketPrice`,
  `getTicketPrice`, `issueBond`, `payBond`, `getBonds`, `setSpeedMultiplier`.
- `build`: `placeBlueprintTracks`, `buildBlueprints`, `eraseBlueprints`, `createRoute`, `buyTrains`, … —
  **the Type Reference marks the build API as currently unusable at runtime.**
- `stations.registerStationType` / `trains.registerTrainType` — register custom *types*, not rename instances.
- `career`, `popTiming`, `registerNewspaperTemplates`, `registerTweetTemplates`, `modifyConstants`.
- Window globals available in-game: `Chance`/`chance` (Chance.js), `deck` (deck.gl), `Hammer`, `luma`,
  `mathgl`, `loaders`, plus Electron bridges `window.electron` / `window.electronAPI`.
