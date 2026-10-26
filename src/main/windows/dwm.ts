import type { BrowserWindow } from 'electron';
import { logger } from '../../shared/logger';

// Natywne atrybuty DWM (Windows 11). `setShape`/`setAccentColor` nie zmieniają
// faktycznego kształtu ramki systemowej — tylko DWM robi to poprawnie.
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_BORDER_COLOR = 34;
const DWMWCP_DONOTROUND = 1;
const DWMWCP_ROUND = 2;

type DwmSetWindowAttribute = (
  hwnd: number | bigint,
  attr: number,
  value: Buffer,
  size: number
) => number;

let dwmFn: DwmSetWindowAttribute | null = null;
let loading: Promise<DwmSetWindowAttribute | null> | null = null;

function loadDwm(): Promise<DwmSetWindowAttribute | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (dwmFn) return Promise.resolve(dwmFn);
  if (loading) return loading;
  loading = (async () => {
    try {
      const koffi = (await import('koffi')).default;
      const dwmapi = koffi.load('dwmapi.dll');
      dwmFn = dwmapi.func(
        'int DwmSetWindowAttribute(uint64_t hwnd, uint32_t attr, void *value, uint32_t size)'
      ) as unknown as DwmSetWindowAttribute;
      return dwmFn;
    } catch (e) {
      logger.warn('window', 'DWM (koffi) unavailable — using Electron fallbacks', e);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function hwndOf(win: BrowserWindow): number | bigint {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0);
}

const reportedFailures = new Set<number>();

function setInt(win: BrowserWindow, attr: number, value: number): boolean {
  const fn = dwmFn;
  if (!fn || win.isDestroyed()) return false;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  try {
    const hr = fn(hwndOf(win), attr, buf, 4);
    if (hr !== 0 && !reportedFailures.has(attr)) {
      reportedFailures.add(attr);
      logger.warn('window', `DwmSetWindowAttribute(${attr}) -> 0x${(hr >>> 0).toString(16)}`);
    }
    return hr === 0;
  } catch (e) {
    if (!reportedFailures.has(attr)) {
      reportedFailures.add(attr);
      logger.warn('window', `DwmSetWindowAttribute(${attr}) threw`, e);
    }
    return false;
  }
}

/** Windows 11: `true` = systemowy łuk DWM, `false` = kwadratowa ramka. */
export async function setDwmRoundedCorners(win: BrowserWindow, rounded: boolean): Promise<boolean> {
  if (!(await loadDwm())) return false;
  return setInt(win, DWMWA_WINDOW_CORNER_PREFERENCE, rounded ? DWMWCP_ROUND : DWMWCP_DONOTROUND);
}

/** `#RRGGBB` → COLORREF (0x00BBGGRR) dla DWMWA_BORDER_COLOR. */
export function colorRefFromHex(hex: string): number | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return null;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return ((b << 16) | (g << 8) | r) >>> 0;
}

/** Kolor 1px ramki okna DWM. */
export async function setDwmBorderColor(win: BrowserWindow, hex: string): Promise<boolean> {
  if (!(await loadDwm())) return false;
  const color = colorRefFromHex(hex);
  if (color === null) return false;
  return setInt(win, DWMWA_BORDER_COLOR, color);
}
