import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./naming', () => ({
  applyToAllStations: vi.fn(() => Promise.resolve(0)),
  resetProcessed: vi.fn(),
  scheduleApplyToAllStations: vi.fn(),
}));
vi.mock('./settings', () => ({
  getSettings: vi.fn(() => ({
    enabled: true,
    mode: 'neighborhood' as const,
    disambiguation: 'auto' as const,
    radiusM: 500,
    sequentialFormat: 'number' as const,
  })),
  updateSettings: vi.fn(),
  isEnabled: vi.fn(() => true),
  setEnabled: vi.fn(),
}));

type Handler = (...args: unknown[]) => void;

function makeMockApi() {
  const handlers: Record<string, Handler[]> = {};
  const toggles: Array<Record<string, unknown>> = [];
  const buttons: Array<Record<string, unknown>> = [];
  const selects: Array<Record<string, unknown>> = [];
  const sliders: Array<Record<string, unknown>> = [];
  const notifications: Array<{ message: string; type?: string }> = [];
  const on = (name: string) => (cb: Handler) => {
    (handlers[name] ??= []).push(cb);
  };
  const api = {
    version: '1.0.0',
    ui: {
      addToggle: vi.fn((_placement: string, opts: Record<string, unknown>) => {
        toggles.push(opts);
      }),
      addButton: vi.fn((_placement: string, opts: Record<string, unknown>) => {
        buttons.push(opts);
      }),
      addSelect: vi.fn((_placement: string, opts: Record<string, unknown>) => {
        selects.push(opts);
      }),
      addSlider: vi.fn((_placement: string, opts: Record<string, unknown>) => {
        sliders.push(opts);
      }),
      addText: vi.fn(),
      addSeparator: vi.fn(),
      addStyledSlider: vi.fn(),
      unregisterComponent: vi.fn(),
      showNotification: vi.fn((message: string, type?: string) => {
        notifications.push({ message, type });
      }),
    },
    hooks: {
      onMapReady: on('mapReady'),
      onBlueprintPlaced: on('blueprintPlaced'),
      onStationBuilt: on('stationBuilt'),
    },
  };
  return { api, handlers, toggles, buttons, selects, sliders, notifications };
}

// main.ts reads window.SubwayBuilderAPI at import time and keeps module-level
// state, so each test resets the registry and re-imports with a fresh API.
async function loadMain(api: unknown) {
  (globalThis as Record<string, unknown>).SubwayBuilderAPI = api;
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).SubwayBuilderAPI = api;
  }
  vi.resetModules();
  await import('./main');
  const [naming, settings] = await Promise.all([import('./naming'), import('./settings')]);
  return { naming, settings };
}

function fireMapReady(handlers: Record<string, Handler[]>) {
  handlers.mapReady[0]();
}

describe('main wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails gracefully when the API is missing', async () => {
    await loadMain(undefined);
    expect(console.error).toHaveBeenCalled();
  });

  it('registers UI and hooks once the map is ready', async () => {
    const mock = makeMockApi();
    await loadMain(mock.api);

    expect(mock.handlers.mapReady).toHaveLength(1);
    fireMapReady(mock.handlers);

    expect(mock.toggles).toHaveLength(1);
    expect(mock.toggles[0].id).toBe('neighborhood-station-names.enabled');
    expect(mock.buttons).toHaveLength(1);
    expect(mock.buttons[0].id).toBe('neighborhood-station-names.rename-existing');
    expect(mock.handlers.blueprintPlaced).toHaveLength(1);
    expect(mock.handlers.stationBuilt).toHaveLength(1);
  });

  it('does not double-register if onMapReady fires again', async () => {
    const mock = makeMockApi();
    await loadMain(mock.api);

    fireMapReady(mock.handlers);
    fireMapReady(mock.handlers);

    expect(mock.toggles).toHaveLength(1);
    expect(mock.buttons).toHaveLength(1);
    expect(mock.handlers.blueprintPlaced).toHaveLength(1);
  });

  it('routes blueprint placement through the deferred scheduler (the bug fix)', async () => {
    const mock = makeMockApi();
    const { naming } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    mock.handlers.blueprintPlaced[0]();

    expect(naming.scheduleApplyToAllStations).toHaveBeenCalledTimes(1);
    expect(naming.scheduleApplyToAllStations).toHaveBeenCalledWith(mock.api);
    expect(naming.applyToAllStations).not.toHaveBeenCalled();
  });

  it('routes station construction through the deferred scheduler', async () => {
    const mock = makeMockApi();
    const { naming } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    mock.handlers.stationBuilt[0]();

    expect(naming.scheduleApplyToAllStations).toHaveBeenCalledWith(mock.api);
    expect(naming.applyToAllStations).not.toHaveBeenCalled();
  });

  it('toggle change persists the setting and resets processed stations', async () => {
    const mock = makeMockApi();
    const { naming, settings } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    const onChange = mock.toggles[0].onChange as (value: boolean) => void;
    onChange(false);

    expect(settings.updateSettings).toHaveBeenCalledWith({ enabled: false });
    expect(naming.resetProcessed).toHaveBeenCalledTimes(1);
    expect(mock.notifications.some((n) => n.type === 'info')).toBe(true);
  });

  it('rename button warns and does nothing while disabled', async () => {
    const mock = makeMockApi();
    const { naming, settings } = await loadMain(mock.api);
    vi.mocked(settings.getSettings).mockReturnValue({
      enabled: false,
      mode: 'neighborhood',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    fireMapReady(mock.handlers);

    const onClick = mock.buttons[0].onClick as () => void;
    onClick();

    expect(mock.notifications.some((n) => n.type === 'warning')).toBe(true);
    expect(naming.applyToAllStations).not.toHaveBeenCalled();
  });

  it('rename button force-applies to existing stations when enabled', async () => {
    const mock = makeMockApi();
    const { naming, settings } = await loadMain(mock.api);
    vi.mocked(settings.getSettings).mockReturnValue({
      enabled: true,
      mode: 'neighborhood',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    vi.mocked(naming.applyToAllStations).mockResolvedValue(3);
    fireMapReady(mock.handlers);

    const onClick = mock.buttons[0].onClick as () => void;
    onClick();

    // Flush the microtask queue so the .then() notification fires.
    await Promise.resolve();

    expect(naming.applyToAllStations).toHaveBeenCalledWith(mock.api, true);
    expect(mock.notifications.some((n) => n.type === 'success' && n.message.includes('3'))).toBe(true);
  });

  it('rename button reports when nothing was renamed', async () => {
    const mock = makeMockApi();
    const { naming, settings } = await loadMain(mock.api);
    vi.mocked(settings.getSettings).mockReturnValue({
      enabled: true,
      mode: 'neighborhood',
      disambiguation: 'auto',
      radiusM: 500,
      sequentialFormat: 'number',
    });
    vi.mocked(naming.applyToAllStations).mockResolvedValue(0);
    fireMapReady(mock.handlers);

    (mock.buttons[0].onClick as () => void)();

    await Promise.resolve();

    expect(mock.notifications.some((n) => n.type === 'info' && /no stations renamed/i.test(n.message))).toBe(true);
  });

  it('mode select change persists the setting and resets processed stations', async () => {
    const mock = makeMockApi();
    const { naming, settings } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    const modeSelect = mock.selects.find((s) => s.id === 'neighborhood-station-names.mode');
    expect(modeSelect).toBeDefined();
    (modeSelect!.onChange as (v: string) => void)('street');

    expect(settings.updateSettings).toHaveBeenCalledWith({ mode: 'street' });
    expect(naming.resetProcessed).toHaveBeenCalled();
    expect(mock.notifications.some((n) => n.message.includes('Street'))).toBe(true);
  });

  it('disambiguation select change persists the setting', async () => {
    const mock = makeMockApi();
    const { settings } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    const disambigSelect = mock.selects.find((s) => s.id === 'neighborhood-station-names.disambiguation');
    expect(disambigSelect).toBeDefined();
    (disambigSelect!.onChange as (v: string) => void)('compass');

    expect(settings.updateSettings).toHaveBeenCalledWith({ disambiguation: 'compass' });
    expect(mock.notifications.some((n) => n.message.includes('Compass'))).toBe(true);
  });

  it('radius slider change persists the setting', async () => {
    const mock = makeMockApi();
    const { settings } = await loadMain(mock.api);
    fireMapReady(mock.handlers);

    expect(mock.sliders).toHaveLength(1);
    (mock.sliders[0].onChange as (v: number) => void)(750);

    expect(settings.updateSettings).toHaveBeenCalledWith({ radiusM: 750 });
    expect(mock.notifications.some((n) => n.message.includes('750'))).toBe(true);
  });
});
