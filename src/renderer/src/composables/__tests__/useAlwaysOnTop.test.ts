import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const appearance = { alwaysOnTop: false };
  const updateAppearance = vi.fn((patch: Partial<typeof appearance>) =>
    Object.assign(appearance, patch)
  );
  return { appearance, updateAppearance };
});

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => mocks
}));

vi.mock('@shared/logger', () => ({
  logger: loggerMock
}));

import { useAlwaysOnTop } from '../useAlwaysOnTop';

const invoke = vi.fn();

describe('useAlwaysOnTop', () => {
  beforeEach(async () => {
    Object.defineProperty(window, 'api', {
      value: { invoke },
      configurable: true
    });
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    loggerMock.warn.mockReset();
    mocks.appearance.alwaysOnTop = false;
    mocks.updateAppearance.mockClear();
    await useAlwaysOnTop().init();
    invoke.mockClear();
  });

  it('restores the persisted pin on init', async () => {
    mocks.appearance.alwaysOnTop = true;
    await useAlwaysOnTop().init();

    expect(invoke).toHaveBeenCalledWith('window:setAlwaysOnTop', true);
    expect(useAlwaysOnTop().pinned.value).toBe(true);
  });

  it('toggles the window and persists the new state', async () => {
    const { pinned, togglePin } = useAlwaysOnTop();

    await togglePin();
    expect(invoke).toHaveBeenLastCalledWith('window:setAlwaysOnTop', true);
    expect(mocks.updateAppearance).toHaveBeenLastCalledWith({ alwaysOnTop: true });
    expect(pinned.value).toBe(true);

    await togglePin();
    expect(invoke).toHaveBeenLastCalledWith('window:setAlwaysOnTop', false);
    expect(mocks.updateAppearance).toHaveBeenLastCalledWith({ alwaysOnTop: false });
    expect(pinned.value).toBe(false);
  });

  it('does not touch the window when applying the current value', async () => {
    await useAlwaysOnTop().apply(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the toggle state when the IPC call fails', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'));
    const { pinned, togglePin } = useAlwaysOnTop();

    await expect(togglePin()).resolves.toBeUndefined();
    expect(pinned.value).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalled();
    expect(mocks.updateAppearance).toHaveBeenCalledWith({ alwaysOnTop: true });
  });
});
