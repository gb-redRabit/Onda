import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  prepare: vi.fn()
}));

vi.mock('../useSessionPersistence', () => ({ prepareSessionForRestart: h.prepare }));

import { useCompactSwitch } from '../useCompactSwitch';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue(true);
  h.prepare.mockClear();
  api.api = { invoke: h.invoke };
});

describe('useCompactSwitch', () => {
  it('switches without preparing a restart in the core shell', async () => {
    const { switching, switchToCompact } = useCompactSwitch();

    const pending = switchToCompact();
    expect(switching.value).toBe(true);
    await pending;

    expect(h.invoke).toHaveBeenNthCalledWith(1, 'app:isCoreShell');
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.invoke).toHaveBeenNthCalledWith(2, 'app:setWindowMode', 'compact');
    expect(switching.value).toBe(false);
  });

  it('persists the session before restarting the legacy window', async () => {
    h.invoke.mockResolvedValue(false);
    const { switchToCompact } = useCompactSwitch();

    await switchToCompact();

    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenLastCalledWith('app:setWindowMode', 'compact');
  });

  it('ignores a second call while switching', async () => {
    let release!: (value: unknown) => void;
    h.invoke.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { switchToCompact } = useCompactSwitch();

    const first = switchToCompact();
    await switchToCompact();
    expect(h.invoke).toHaveBeenCalledTimes(1);

    release(true);
    await first;
  });

  it('re-enables the control after a failure', async () => {
    h.invoke.mockRejectedValue(new Error('no ipc'));
    const { switching, switchToCompact } = useCompactSwitch();

    await expect(switchToCompact()).resolves.toBeUndefined();
    expect(switching.value).toBe(false);
  });

  it('tolerates a missing preload api', async () => {
    api.api = undefined;
    const { switching, switchToCompact } = useCompactSwitch();

    await expect(switchToCompact()).resolves.toBeUndefined();
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(switching.value).toBe(false);
  });
});
