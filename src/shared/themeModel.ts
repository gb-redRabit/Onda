export const COLOR_TOKEN_IDS = [
  'base100',
  'base200',
  'base300',
  'baseContent',
  'primary',
  'primaryContent',
  'secondary',
  'secondaryContent',
  'accent',
  'accentContent',
  'neutral',
  'neutralContent',
  'info',
  'infoContent',
  'success',
  'successContent',
  'warning',
  'warningContent',
  'error',
  'errorContent'
] as const;

export type ColorTokenId = (typeof COLOR_TOKEN_IDS)[number];

export type ThemeScheme = 'dark' | 'light';

export interface ThemeGeometry {
  radiusBox: number;
  radiusField: number;
  radiusSelector: number;
  sizeField: number;
  sizeSelector: number;
  border: number;
  depth: 0 | 1;
  noise: 0 | 1;
}

export const FIELD_SIZE_PRESETS = ['2rem', '2.25rem', '2.5rem', '2.75rem', '3rem'] as const;
export const SELECTOR_SIZE_PRESETS = ['14px', '16px', '18px', '20px', '22px'] as const;

export const DEFAULT_GEOMETRY: ThemeGeometry = {
  radiusBox: 8,
  radiusField: 4,
  radiusSelector: 8,
  sizeField: 2,
  sizeSelector: 2,
  border: 1,
  depth: 1,
  noise: 0
};

export interface SemanticTheme {
  scheme: ThemeScheme;
  colors: Record<ColorTokenId, string>;
  geometry: ThemeGeometry;
  glassAlpha: number;
}

export interface ThemeAppearanceSource {
  theme: string;
  customBase?: string;
  customColors?: Partial<Record<string, string>>;
  geometry?: Partial<ThemeGeometry>;
  glassAlpha?: number;
}

const HEX_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/;

export function sanitizeHex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (!HEX_RE.test(s)) return undefined;
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return s;
}

export function sanitizeColorRecord(v: unknown): Partial<Record<ColorTokenId, string>> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Partial<Record<ColorTokenId, string>> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (!(COLOR_TOKEN_IDS as readonly string[]).includes(key)) continue;
    const hex = sanitizeHex(value);
    if (hex) out[key as ColorTokenId] = hex;
  }
  return out;
}

function clampNum(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = clampNum(v, min, max);
  return n === undefined ? undefined : Math.round(n);
}

function zeroOne(v: unknown): 0 | 1 | undefined {
  if (v === 0 || v === 1) return v;
  return undefined;
}

function normalizeSizeMultiplier(v: number | undefined): 1 | 2 | 3 | 4 | 5 | undefined {
  if (v === undefined) return undefined;
  const legacy = v > 5 ? Math.round(v / 2) : Math.round(v);
  const clamped = Math.min(5, Math.max(1, legacy));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

export function sanitizeGeometry(v: unknown): Partial<ThemeGeometry> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const g = v as Record<string, unknown>;
  const out: Partial<ThemeGeometry> = {};
  const radius = clampInt(g.radiusBox, 0, 32);
  if (radius !== undefined) out.radiusBox = radius;
  const field = clampInt(g.radiusField, 0, 32);
  if (field !== undefined) out.radiusField = field;
  const selector = clampInt(g.radiusSelector, 0, 32);
  if (selector !== undefined) out.radiusSelector = selector;
  const sfRaw =
    typeof g.sizeField === 'number' && Number.isFinite(g.sizeField) ? g.sizeField : undefined;
  const sf = normalizeSizeMultiplier(sfRaw);
  if (sf !== undefined) out.sizeField = sf;
  const ssRaw =
    typeof g.sizeSelector === 'number' && Number.isFinite(g.sizeSelector)
      ? g.sizeSelector
      : undefined;
  const ss = normalizeSizeMultiplier(ssRaw);
  if (ss !== undefined) out.sizeSelector = ss;
  const border = clampInt(g.border, 0, 4);
  if (border !== undefined) out.border = border;
  const depth = zeroOne(g.depth);
  if (depth !== undefined) out.depth = depth;
  const noise = zeroOne(g.noise);
  if (noise !== undefined) out.noise = noise;
  return out;
}

export function tokenToCssVar(id: ColorTokenId): string {
  const kebab = id
    .replace(/([A-Z])/g, '-$1')
    .replace(/(\d+)/g, '-$1')
    .toLowerCase();
  return `--color-${kebab}`;
}

export function buildEngineVars(t: SemanticTheme, fontSize: number): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const id of COLOR_TOKEN_IDS) {
    vars[tokenToCssVar(id)] = t.colors[id];
  }
  const glassOn = t.glassAlpha < 100;
  vars['--radius-box'] = glassOn ? '0px' : `${t.geometry.radiusBox}px`;
  vars['--radius-field'] = `${t.geometry.radiusField}px`;
  vars['--radius-selector'] = `${t.geometry.radiusSelector}px`;
  vars['--size-field'] = FIELD_SIZE_PRESETS[t.geometry.sizeField - 1];
  vars['--size-selector'] = SELECTOR_SIZE_PRESETS[t.geometry.sizeSelector - 1];
  vars['--border'] = `${t.geometry.border}px`;
  vars['--depth'] = String(t.geometry.depth);
  vars['--noise'] = String(t.geometry.noise);
  vars['--glass-alpha'] = `${t.glassAlpha}%`;
  vars['--font-size'] = `${fontSize}px`;
  return vars;
}
