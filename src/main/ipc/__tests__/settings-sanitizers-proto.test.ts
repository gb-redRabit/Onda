import { describe, it, expect } from 'vitest';
import {
  obj,
  primitiveRecord,
  stringRecord,
  recordOf,
  str,
  safeAssign
} from '../settings/settings-sanitizers';
import { sanitizeStoredObject } from '../plugins/plugins-guards';

// Regresja bezpieczeństwa: klucze kontrolowane przez renderer (`__proto__`/`constructor`/
// `prototype`) nie mogą zmienić prototypu produkowanego obiektu ani globalnego
// `Object.prototype`.

describe('sanitizers reject prototype-polluting keys', () => {
  it('safeAssign refuses __proto__/constructor/prototype', () => {
    const out: Record<string, unknown> = {};
    expect(safeAssign(out, '__proto__', { polluted: true })).toBe(false);
    expect(safeAssign(out, 'constructor', 'x')).toBe(false);
    expect(safeAssign(out, 'prototype', 'x')).toBe(false);
    expect(safeAssign(out, 'ok', 1)).toBe(true);
    expect(out.ok).toBe(1);
    // Prototyp nie został zmieniony.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('obj() drops a __proto__ field but keeps valid ones', () => {
    const clean = obj({ name: str })(JSON.parse('{"name":"a","__proto__":{"x":1}}')) as Record<
      string,
      unknown
    >;
    expect(clean.name).toBe('a');
    expect(clean.x).toBeUndefined();
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
  });

  it('record builders drop polluting keys', () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true},"a":"1"}');
    for (const build of [primitiveRecord, stringRecord, () => recordOf(str)(parsed)]) {
      const out = build(parsed) as Record<string, unknown>;
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(out.polluted).toBeUndefined();
    }
  });

  it('plugin storage sanitizer drops __proto__', () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true},"safe":"v"}');
    const out = sanitizeStoredObject(parsed);
    expect(out.safe).toBe('v');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});
