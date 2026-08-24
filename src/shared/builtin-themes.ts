import type {
  ColorTokenId,
  SemanticTheme,
  ThemeAppearanceSource,
  ThemeGeometry
} from './themeModel';
import { DEFAULT_GEOMETRY, sanitizeColorRecord, sanitizeGeometry } from './themeModel';

export const BUILTIN_THEME_NAMES = [
  'dark',
  'light',
  'midnight',
  'spotify',
  'luxury',
  'cyberpunk',
  'aqua',
  'black',
  'lemonade',
  'abyss'
] as const;

export type BuiltinThemeName = (typeof BUILTIN_THEME_NAMES)[number];

function geom(
  radiusBox: number,
  radiusField: number,
  radiusSelector: number,
  border: number,
  depth: 0 | 1,
  noise: 0 | 1
): ThemeGeometry {
  return {
    radiusBox,
    radiusField,
    radiusSelector,
    sizeField: DEFAULT_GEOMETRY.sizeField,
    sizeSelector: DEFAULT_GEOMETRY.sizeSelector,
    border,
    depth,
    noise
  };
}

export function resolveThemeAppearance(src: ThemeAppearanceSource): SemanticTheme {
  const name = (BUILTIN_THEME_NAMES as readonly string[]).includes(src.theme)
    ? (src.theme as BuiltinThemeName)
    : null;
  if (name) {
    const t = BUILTIN_THEMES[name];
    return {
      scheme: t.scheme,
      colors: { ...t.colors },
      geometry: { ...t.geometry, ...(sanitizeGeometry(src.geometry) ?? {}) },
      glassAlpha: src.glassAlpha ?? t.glassAlpha
    };
  }
  const seed: BuiltinThemeName =
    src.customBase && (BUILTIN_THEME_NAMES as readonly string[]).includes(src.customBase)
      ? (src.customBase as BuiltinThemeName)
      : 'dark';
  const base = BUILTIN_THEMES[seed];
  const colors: Record<ColorTokenId, string> = { ...base.colors };
  const custom = sanitizeColorRecord(src.customColors);
  if (custom) Object.assign(colors, custom);
  return {
    scheme: base.scheme,
    colors,
    geometry: { ...base.geometry, ...(sanitizeGeometry(src.geometry) ?? {}) },
    glassAlpha: src.glassAlpha ?? base.glassAlpha
  };
}

export const BUILTIN_THEMES: Record<BuiltinThemeName, SemanticTheme> = {
  dark: {
    scheme: 'dark',
    colors: {
      base100: '#1d232a',
      base200: '#191e24',
      base300: '#15191e',
      baseContent: '#ecf9ff',
      primary: '#605dff',
      primaryContent: '#edf1fe',
      secondary: '#f43098',
      secondaryContent: '#f9e4f0',
      accent: '#00d3bb',
      accentContent: '#084d49',
      neutral: '#09090b',
      neutralContent: '#e4e4e7',
      info: '#00bafe',
      infoContent: '#042e49',
      success: '#00d390',
      successContent: '#004c39',
      warning: '#fcb700',
      warningContent: '#793205',
      error: '#ff627d',
      errorContent: '#4d0218'
    },
    geometry: DEFAULT_GEOMETRY,
    glassAlpha: 100
  },
  light: {
    scheme: 'light',
    colors: {
      base100: '#ffffff',
      base200: '#f8f8f8',
      base300: '#eeeeee',
      baseContent: '#18181b',
      primary: '#422ad5',
      primaryContent: '#e0e7ff',
      secondary: '#f43098',
      secondaryContent: '#f9e4f0',
      accent: '#00d3bb',
      accentContent: '#084d49',
      neutral: '#09090b',
      neutralContent: '#e4e4e7',
      info: '#00bafe',
      infoContent: '#042e49',
      success: '#00d390',
      successContent: '#004c39',
      warning: '#fcb700',
      warningContent: '#793205',
      error: '#ff627d',
      errorContent: '#4d0218'
    },
    geometry: DEFAULT_GEOMETRY,
    glassAlpha: 100
  },
  midnight: {
    scheme: 'dark',
    colors: {
      base100: '#161b22',
      base200: '#0d1117',
      base300: '#21262d',
      baseContent: '#c9d1d9',
      primary: '#58a6ff',
      primaryContent: '#04182b',
      secondary: '#bc8cff',
      secondaryContent: '#150b26',
      accent: '#39c5cf',
      accentContent: '#032a2e',
      neutral: '#010409',
      neutralContent: '#c9d1d9',
      info: '#79c0ff',
      infoContent: '#05203a',
      success: '#3fb950',
      successContent: '#03260f',
      warning: '#d29922',
      warningContent: '#271c03',
      error: '#f85149',
      errorContent: '#390608'
    },
    geometry: DEFAULT_GEOMETRY,
    glassAlpha: 100
  },
  spotify: {
    scheme: 'dark',
    colors: {
      base100: '#181818',
      base200: '#121212',
      base300: '#242424',
      baseContent: '#eaeaea',
      primary: '#1db954',
      primaryContent: '#04150a',
      secondary: '#509bf5',
      secondaryContent: '#0a1a33',
      accent: '#ffb44d',
      accentContent: '#2e1d02',
      neutral: '#000000',
      neutralContent: '#eaeaea',
      info: '#509bf5',
      infoContent: '#0a1a33',
      success: '#1db954',
      successContent: '#04150a',
      warning: '#ffa42b',
      warningContent: '#2b1902',
      error: '#f15e6c',
      errorContent: '#38070d'
    },
    geometry: DEFAULT_GEOMETRY,
    glassAlpha: 100
  },
  luxury: {
    scheme: 'dark',
    colors: {
      base100: '#09090b',
      base200: '#171618',
      base300: '#1e1d1f',
      baseContent: '#dca54d',
      primary: '#ffffff',
      primaryContent: '#161616',
      secondary: '#152747',
      secondaryContent: '#cbd0d7',
      accent: '#513448',
      accentContent: '#dad3d7',
      neutral: '#331800',
      neutralContent: '#ffe7a4',
      info: '#67c6ff',
      infoContent: '#040e16',
      success: '#87d03a',
      successContent: '#061001',
      warning: '#e2d563',
      warningContent: '#121003',
      error: '#ff6f6f',
      errorContent: '#160404'
    },
    geometry: geom(16, 8, 16, 1, 1, 1),
    glassAlpha: 100
  },
  cyberpunk: {
    scheme: 'light',
    colors: {
      base100: '#fff248',
      base200: '#f7e83a',
      base300: '#e3d40e',
      baseContent: '#000000',
      primary: '#ff6596',
      primaryContent: '#180408',
      secondary: '#00e8ff',
      secondaryContent: '#001316',
      accent: '#ce74ff',
      accentContent: '#0f0517',
      neutral: '#111a3b',
      neutralContent: '#fff248',
      info: '#00b5ff',
      infoContent: '#000000',
      success: '#00a96e',
      successContent: '#000000',
      warning: '#ffbe00',
      warningContent: '#000000',
      error: '#ff5861',
      errorContent: '#000000'
    },
    geometry: geom(0, 0, 0, 1, 0, 0),
    glassAlpha: 100
  },
  aqua: {
    scheme: 'dark',
    colors: {
      base100: '#1a368b',
      base200: '#162455',
      base300: '#091444',
      baseContent: '#b8e6fe',
      primary: '#13ecf3',
      primaryContent: '#015355',
      secondary: '#966fb3',
      secondaryContent: '#f2f0fc',
      accent: '#ffe999',
      accentContent: '#161309',
      neutral: '#05176c',
      neutralContent: '#90baff',
      info: '#2563eb',
      infoContent: '#d2e2ff',
      success: '#18a34a',
      successContent: '#000a02',
      warning: '#d97708',
      warningContent: '#431700',
      error: '#ff7265',
      errorContent: '#180403'
    },
    geometry: geom(16, 8, 16, 1, 1, 0),
    glassAlpha: 100
  },
  black: {
    scheme: 'dark',
    colors: {
      base100: '#000000',
      base200: '#141414',
      base300: '#1b1b1b',
      baseContent: '#d6d6d6',
      primary: '#3a3a3a',
      primaryContent: '#ffffff',
      secondary: '#3a3a3a',
      secondaryContent: '#ffffff',
      accent: '#3a3a3a',
      accentContent: '#ffffff',
      neutral: '#3a3a3a',
      neutralContent: '#ffffff',
      info: '#0000ff',
      infoContent: '#c6dbff',
      success: '#028002',
      successContent: '#d3e6d0',
      warning: '#ffff00',
      warningContent: '#161600',
      error: '#ff0301',
      errorContent: '#160000'
    },
    geometry: geom(0, 0, 0, 1, 0, 0),
    glassAlpha: 100
  },
  lemonade: {
    scheme: 'light',
    colors: {
      base100: '#f8fdef',
      base200: '#e1e6d9',
      base300: '#cbcfc3',
      baseContent: '#151614',
      primary: '#419400',
      primaryContent: '#010800',
      secondary: '#bdc000',
      secondaryContent: '#0d0e00',
      accent: '#edd000',
      accentContent: '#141000',
      neutral: '#343300',
      neutralContent: '#d2d3c7',
      info: '#b1d9e9',
      infoContent: '#0c1113',
      success: '#b9dbc6',
      successContent: '#0d110e',
      warning: '#d7d3b0',
      warningContent: '#11100c',
      error: '#efc6c2',
      errorContent: '#140e0e'
    },
    geometry: geom(16, 8, 16, 1, 0, 0),
    glassAlpha: 100
  },
  abyss: {
    scheme: 'dark',
    colors: {
      base100: '#001e29',
      base200: '#00111d',
      base300: '#000611',
      baseContent: '#ffd6a7',
      primary: '#bdff00',
      primaryContent: '#427600',
      secondary: '#cebef4',
      secondaryContent: '#564775',
      accent: '#505050',
      accentContent: '#f8f8f8',
      neutral: '#003843',
      neutralContent: '#ffd6a7',
      info: '#00bafe',
      infoContent: '#042e49',
      success: '#01df72',
      successContent: '#022d14',
      warning: '#ffbf00',
      warningContent: '#854200',
      error: '#f04e4f',
      errorContent: '#690000'
    },
    geometry: geom(8, 4, 32, 1, 1, 0),
    glassAlpha: 100
  }
};
