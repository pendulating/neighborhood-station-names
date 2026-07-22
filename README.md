# Neighborhood Station Names

*A mod for Subway Builder that names stations after their neighborhoods, rather than the nearest road.*


## What it does

Specifically, the mod introduces three behaviors: a toggle, "Name stations by neighborhood," which switches neighborhood-based naming on or off (on by default); a button, "Rename existing stations by neighborhood," which re-applies neighborhood names to every station already on the map; and automatic naming, which labels each new station as we place it in blueprint mode or construct it, whenever the toggle is on.

## UX

The mod does not fight a manual rename: once a name is changed by hand, the mod leaves it alone. It also degrades gracefully where labels are sparse: it tries neighborhood labels first, then suburb labels, then city labels (searching within roughly 4,000 meters, about 2.5 miles, of each station), and finally it just leaves the road-based name in place.

## Requirements

The mod requires the following:

- Subway Builder v1.1.0 or newer.
- A map that includes neighborhood labels, which is true of the default maps and most high-quality modded maps.

## Installation

Install with Railyard, then enable the mod in-game under Settings -> Mods.

## Usage

1. Open Settings and confirm that "Name stations by neighborhood" is on.
2. Place stations as usual; each new station takes the name of its nearest neighborhood.
3. To rename stations that already exist (e.g., after turning the toggle on for the first time), click "Rename existing stations by neighborhood."

The toggle persists between sessions on a best-effort basis. The game's own mod-storage facility is currently in-flux, so the mod stores this single setting in `localStorage` instead; this is a documented workaround and may, in rare cases, reset.

## Building from source
Contributions are welcome and please report issues! To build the mod yourself, use pnpm:

```bash
pnpm install      # install dependencies
pnpm build        # write the mod to dist/
pnpm test         # run the automated test suite
```

The repository ships with an automated test suite and continuous-integration checks; on every push, it runs the type checker, the tests (with enforced coverage thresholds), and a build.


## License

This mod is released under the MIT License.
