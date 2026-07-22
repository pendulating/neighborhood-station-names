# Subway Builder Template Mod — Documentation (curated)

Reference copies of the **Subway Builder Modded Template Mod** documentation (Modding API **v1.0.0**),
plus an API-surface reference distilled from the installed template and an analysis of how it all maps to
the [neighborhood-based station naming idea](../jul22-high-level-idea.md).

## Provenance

- Pages 01–06 are the official docs at
  [subwaybuildermodded.com/template-mod/docs](https://subwaybuildermodded.com/template-mod/docs), faithfully
  converted from the site's compiled MDX (retrieved **2026-07-22**). The docs site is a client-rendered SPA
  with no server-side HTML or sitemap, so content was recovered from its lazy-loaded page chunks and
  reconstructed to Markdown.
- Page 07 is distilled from the template's own TypeScript definitions in `src/types/*.d.ts` — the
  authoritative surface. (The docs' Type Reference is a simplified subset.)
- Page 08 is original analysis for this project; findings drawn from the site bundle and Depot docs are
  labelled as such, and unverified inferences are marked **hypothesis — verify in-game**.

## Contents

| File | What's in it |
| --- | --- |
| [01-getting-started.md](./01-getting-started.md) | Setup, build, link-to-game, dev workflow, scripts |
| [02-project-structure.md](./02-project-structure.md) | What each template file does (`main.ts`, `ui/`, `types/`, scripts, configs) |
| [03-common-patterns.md](./03-common-patterns.md) | Recipes: init, UI panels/**settings-menu controls**, reading game state, **station data**, **all hooks**, actions, storage caveat |
| [04-react-components.md](./04-react-components.md) | React shim, game UI components, Lucide icons, Recharts, Tailwind, **`registerComponent('settings-menu', …)`** |
| [05-debugging.md](./05-debugging.md) | Hot reload, logging, error handling, common issues |
| [06-type-reference.md](./06-type-reference.md) | How the `.d.ts` files are organized; note that **`build`/`storage` are listed but unusable at runtime** |
| [07-api-surface-reference.md](./07-api-surface-reference.md) | **Full `ModdingAPI` surface** by namespace + key data types, from the installed types |
| [08-relevance-to-neighborhood-naming.md](./08-relevance-to-neighborhood-naming.md) | **How the API maps to the MVP**, key findings, the naming-override risk, open questions |

## TL;DR for this mod

- **Toggle UI:** `api.ui.addToggle('settings-menu', …)` (or `registerComponent('settings-menu', …)` with a
  `Switch`), registered inside a guarded `onMapReady`.
- **When to rename:** `hooks.onStationBuilt` / `hooks.onBlueprintPlaced`; `Station` has `name` + `coords`
  (`[lng, lat]`).
- **Neighborhood names live in the base-map tiles** as a distinct `neighborhoodLabel` symbol layer — read
  them via the MapLibre instance from `api.utils.getMap()` (`queryRenderedFeatures`), **not** from
  `CityDataFiles` (which only carries `roads`, the default road-name source).
- **Biggest risk:** v1.0.0 exposes **no documented station-rename API** — feasibility spike needed before
  building the UI. See [08](./08-relevance-to-neighborhood-naming.md) §4.
- **Persistence:** `api.storage` is Electron-only and currently broken → use `localStorage`.
