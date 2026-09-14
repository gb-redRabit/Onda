import { isPlainObject } from './settings-sanitizers';

export const AUDIO_PIP_DOCKS = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
] as const;

export const AUDIO_PIP_ELEMENTS = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume',
  'viz',
  'nextTrack',
  'eq'
] as const;

export function pipElementArray(v: unknown): unknown | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    if (typeof x === 'string' && (AUDIO_PIP_ELEMENTS as readonly string[]).includes(x)) out.push(x);
  }
  return out;
}

export function migrateAppearance(v: unknown): unknown {
  if (!isPlainObject(v)) return v;
  const src = v as Record<string, unknown>;
  let out: Record<string, unknown> = src;
  const acc = src['accentColor'];
  const cc = src['customColors'];
  if (
    typeof acc === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(acc) &&
    !(isPlainObject(cc) && typeof cc['primary'] === 'string')
  ) {
    out = { ...out, customColors: { ...(isPlainObject(cc) ? cc : {}), primary: acc } };
  }
  // Migracja starego modelu 4 trybów -> jeden adaptacyjny dock.
  // Uzupełniamy TYLKO gdy payload zawiera jakiekolwiek klucze PiP (nie psujemy toEqual w testach).
  const hasPipKeys = [
    'audioPipDock',
    'audioPipMode',
    'audioPipPosition',
    'audioPipEdgePosition',
    'audioPipCornerElements',
    'audioPipEdgeElements',
    'audioPipAutoHide',
    'audioPipAutoShow',
    'audioPipOpacity'
  ].some((k) => k in out);
  if (!hasPipKeys) return out;
  out = { ...out };
  if (!('audioPipDock' in out) || typeof out['audioPipDock'] !== 'string') {
    const mode = src['audioPipMode'];
    const pos = src['audioPipPosition'];
    const edge = src['audioPipEdgePosition'];
    if (mode === 'wide' || mode === 'max') {
      out['audioPipDock'] = edge === 'top' ? 'top' : 'bottom';
    } else if (typeof pos === 'string' && (AUDIO_PIP_DOCKS as readonly string[]).includes(pos)) {
      out['audioPipDock'] = pos as (typeof AUDIO_PIP_DOCKS)[number];
    } else {
      out['audioPipDock'] = 'bottom-right';
    }
  }
  if (!('audioPipCornerElements' in out)) {
    out['audioPipCornerElements'] = ['cover', 'trackInfo', 'controls', 'progress', 'volume'];
  }
  if (!('audioPipEdgeElements' in out)) {
    out['audioPipEdgeElements'] = ['cover', 'trackInfo', 'controls', 'progress', 'volume', 'viz'];
  }
  if (!('audioPipAutoHide' in out)) out['audioPipAutoHide'] = true;
  return out;
}
