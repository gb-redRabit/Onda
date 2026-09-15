import { describe, expect, it } from 'vitest';
import en from '../en';
import pl from '../pl';

type LocaleTree = { [key: string]: LocaleTree | unknown };

function isTree(value: unknown): value is LocaleTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyPaths(tree: LocaleTree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTree(value)) out.push(...keyPaths(value, path));
    else out.push(path);
  }
  return out;
}

describe('locale parity (en/pl)', () => {
  it('exposes the same key set in both languages', () => {
    const enKeys = new Set(keyPaths(en as unknown as LocaleTree));
    const plKeys = new Set(keyPaths(pl as unknown as LocaleTree));

    const missingInPl = [...enKeys].filter((key) => !plKeys.has(key)).sort();
    const missingInEn = [...plKeys].filter((key) => !enKeys.has(key)).sort();

    expect({ missingInPl, missingInEn }).toEqual({ missingInPl: [], missingInEn: [] });
  });
});
