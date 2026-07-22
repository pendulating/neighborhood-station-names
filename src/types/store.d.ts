/**
 * Types for the game's internal Zustand store bridge.
 *
 * These are NOT part of the public Modding API — they were reverse-engineered from
 * the game bundle. The game registers a small bridge on `globalThis` via
 * `setStoreCallbacks({ setMoney, setTicketCost, getState })`, where `getState()`
 * returns the full main store (the same object the in-game rename box mutates).
 *
 * See design_docs/template_documentation/08-relevance-to-neighborhood-naming.md.
 */

import type { Station } from './game-state';

/** Payload accepted by the store's `updateStationName` action. */
export type UpdateStationNamePayload =
  | { type: 'newName'; newName: string }
  | { type: 'refresh' };

/** The subset of the main store this mod relies on. */
export interface MainStoreState {
  /** All stations (both `blueprint` and `constructed`). */
  stations: Station[];
  /**
   * Set or recompute a station's name. `{ type: 'newName', newName }` sets it
   * directly (what the rename text box calls); `{ type: 'refresh' }` regenerates
   * the default road-based name (what the refresh button calls).
   */
  updateStationName(stationId: string, payload: UpdateStationNamePayload): void;
  [key: string]: unknown;
}

/** The bridge object the game exposes on `globalThis`. */
export interface StoreCallbacks {
  getState(): MainStoreState;
  setMoney?(amount: number): void;
  setTicketCost?(cost: number): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __subwayBuilder_storeCallbacks__: StoreCallbacks | undefined;
}
