import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  koffi: {
    load: vi.fn()
  },
  native: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('koffi', () => ({ default: state.koffi }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, error: vi.fn(), info: vi.fn() }
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

async function load() {
  vi.resetModules();
  return import('../dwm');
}

function windowMock(handle = Buffer.from([0x22, 0x11, 0, 0, 0, 0, 0, 0])) {
  return {
    getNativeWindowHandle: vi.fn(() => handle),
    isDestroyed: vi.fn(() => false)
  } as never;
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  state.native.mockReset();
  state.native.mockReturnValue(0);
  state.koffi.load.mockReset();
  state.koffi.load.mockReturnValue({ func: vi.fn(() => state.native) });
  state.loggerWarn.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
});

describe('platform gating', () => {
  it('does nothing outside Windows', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    const dwm = await load();

    await expect(dwm.setDwmRoundedCorners(windowMock(), true)).resolves.toBe(false);
    await expect(dwm.setDwmBorderColor(windowMock(), '#112233')).resolves.toBe(false);
    expect(state.koffi.load).not.toHaveBeenCalled();
  });

  it('logs when koffi cannot load', async () => {
    state.koffi.load.mockImplementation(() => {
      throw new Error('no dll');
    });
    const dwm = await load();

    await expect(dwm.setDwmRoundedCorners(windowMock(), true)).resolves.toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'window',
      expect.stringContaining('DWM (koffi) unavailable'),
      expect.any(Error)
    );
  });
});

describe('rounded corners', () => {
  it('sets the round preference and reads the native handle', async () => {
    const dwm = await load();
    const win = windowMock();

    await expect(dwm.setDwmRoundedCorners(win, true)).resolves.toBe(true);

    expect(state.koffi.load).toHaveBeenCalledWith(
      expect.stringMatching(/System32[\\/]dwmapi\.dll$|^dwmapi\.dll$/)
    );
    expect(state.native).toHaveBeenCalledWith(0x1122n, 33, expect.any(Buffer), 4);
    const buffer = state.native.mock.calls[0][2] as Buffer;
    expect(buffer.readUInt32LE(0)).toBe(2);
  });

  it('uses the square preference when asked', async () => {
    const dwm = await load();
    await dwm.setDwmRoundedCorners(windowMock(), false);

    const buffer = state.native.mock.calls[0][2] as Buffer;
    expect(buffer.readUInt32LE(0)).toBe(1);
  });

  it('supports 32-bit handles', async () => {
    const dwm = await load();
    await dwm.setDwmRoundedCorners(windowMock(Buffer.from([0x44, 0x33, 0x22, 0x11])), true);

    expect(state.native.mock.calls[0][0]).toBe(0x11223344);
  });

  it('returns false for destroyed windows', async () => {
    const dwm = await load();
    const win = { getNativeWindowHandle: vi.fn(), isDestroyed: vi.fn(() => true) } as never;

    await expect(dwm.setDwmRoundedCorners(win, true)).resolves.toBe(false);
    expect(state.native).not.toHaveBeenCalled();
  });

  it('loads the native library only once', async () => {
    const dwm = await load();
    const win = windowMock();

    await dwm.setDwmRoundedCorners(win, true);
    await dwm.setDwmBorderColor(win, '#000000');

    expect(state.koffi.load).toHaveBeenCalledTimes(1);
  });
});

describe('border color', () => {
  it('sets the COLORREF value', async () => {
    const dwm = await load();
    await dwm.setDwmBorderColor(windowMock(), '#112233');

    expect(state.native).toHaveBeenCalledWith(expect.any(BigInt), 34, expect.any(Buffer), 4);
    const buffer = state.native.mock.calls[0][2] as Buffer;
    expect(buffer.readUInt32LE(0)).toBe(0x332211);
  });

  it('rejects invalid hex without calling native code', async () => {
    const dwm = await load();
    await expect(dwm.setDwmBorderColor(windowMock(), 'nope')).resolves.toBe(false);
    expect(state.native).not.toHaveBeenCalled();
  });
});

describe('failure reporting', () => {
  it('logs a non-zero HRESULT once per attribute', async () => {
    state.native.mockReturnValue(0x80070005);
    const dwm = await load();
    const win = windowMock();

    await expect(dwm.setDwmRoundedCorners(win, true)).resolves.toBe(false);
    await dwm.setDwmRoundedCorners(win, false);

    expect(state.loggerWarn).toHaveBeenCalledTimes(1);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'window',
      'DwmSetWindowAttribute(33) -> 0x80070005'
    );
  });

  it('logs a throw once per attribute', async () => {
    state.native.mockImplementation(() => {
      throw new Error('crash');
    });
    const dwm = await load();
    const win = windowMock();

    await expect(dwm.setDwmRoundedCorners(win, true)).resolves.toBe(false);
    await dwm.setDwmRoundedCorners(win, false);

    expect(state.loggerWarn).toHaveBeenCalledTimes(1);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'window',
      'DwmSetWindowAttribute(33) threw',
      expect.any(Error)
    );
  });
});
