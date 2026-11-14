import { describe, expect, it } from 'vitest';
import {
  arrayOf,
  bool,
  enumOf,
  hexStr,
  isPlainObject,
  nullable,
  num,
  numClamped,
  obj,
  primitiveRecord,
  recordOf,
  sizeMultiplier,
  str,
  stringArray,
  stringRecord,
  viewModes
} from '../settings/settings-sanitizers';

const unsafe = JSON.parse('{"__proto__":"x","constructor":"y","prototype":"z","ok":"v"}');

describe('primitives', () => {
  it('detects plain objects only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('accepts only matching primitive types', () => {
    expect(str('a')).toBe('a');
    expect(str(1)).toBeUndefined();
    expect(num(1.5)).toBe(1.5);
    expect(num(Number.NaN)).toBeUndefined();
    expect(num('1')).toBeUndefined();
    expect(bool(true)).toBe(true);
    expect(bool(0)).toBeUndefined();
  });

  it('clamps finite numbers', () => {
    const clamp = numClamped(0, 10);
    expect(clamp(-1)).toBe(0);
    expect(clamp(4)).toBe(4);
    expect(clamp(11)).toBe(10);
    expect(clamp(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(clamp('4')).toBeUndefined();
  });

  it('restricts values to an enum', () => {
    const pick = enumOf(['a', 'b']);
    expect(pick('a')).toBe('a');
    expect(pick('c')).toBeUndefined();
    expect(pick(1)).toBeUndefined();
  });

  it('passes null through a nullable sanitizer', () => {
    const pick = nullable(str);
    expect(pick(null)).toBeNull();
    expect(pick('a')).toBe('a');
    expect(pick(1)).toBeUndefined();
  });
});

describe('object builders', () => {
  it('builds an object from known fields only', () => {
    const sanitize = obj({ name: str, age: num, missing: str });
    expect(sanitize({ name: 'a', age: 2, extra: true })).toEqual({ name: 'a', age: 2 });
    expect(sanitize({ name: 1 })).toEqual({});
    expect(sanitize([])).toBeUndefined();
  });

  it('drops unsafe keys in obj()', () => {
    const sanitize = obj(Object.fromEntries([['__proto__', str]]));
    expect(sanitize(unsafe)).toEqual({});
  });

  it('keeps only strings in stringRecord()', () => {
    expect(stringRecord({ a: 'x', b: 1, c: true })).toEqual({ a: 'x' });
    expect(stringRecord(unsafe)).toEqual({ ok: 'v' });
    expect(stringRecord('nope')).toBeUndefined();
  });

  it('keeps primitive values in primitiveRecord()', () => {
    expect(primitiveRecord({ a: 'x', b: 1, c: true, d: {}, e: null })).toEqual({
      a: 'x',
      b: 1,
      c: true
    });
    expect(primitiveRecord(unsafe)).toEqual({ ok: 'v' });
    expect(primitiveRecord([])).toBeUndefined();
  });

  it('drops invalid values in recordOf()', () => {
    const sanitize = recordOf(numClamped(0, 5));
    expect(sanitize({ a: 1, b: 9, c: 'x' })).toEqual({ a: 1, b: 5 });
    expect(sanitize(unsafe)).toEqual({});
    expect(sanitize(null)).toBeUndefined();
  });
});

describe('array and record helpers', () => {
  it('filters array items with arrayOf()', () => {
    const sanitize = arrayOf(numClamped(0, 5));
    expect(sanitize([1, 9, 'x', -2])).toEqual([1, 5, 0]);
    expect(sanitize('nope')).toBeUndefined();
  });

  it('keeps only strings in stringArray()', () => {
    expect(stringArray(['a', 1, 'b', null])).toEqual(['a', 'b']);
    expect(stringArray({})).toBeUndefined();
  });

  it('keeps only list/grid view modes', () => {
    expect(viewModes({ a: 'list', b: 'grid', c: 'table', d: 1 })).toEqual({ a: 'list', b: 'grid' });
    expect(viewModes(unsafe)).toEqual({});
    expect(viewModes([])).toBeUndefined();
  });
});

describe('formatters', () => {
  it('normalizes hex colors', () => {
    expect(hexStr('  #AABBCC ')).toBe('#aabbcc');
    expect(hexStr('#abc')).toBe('#abc');
    expect(hexStr('#abcd')).toBeUndefined();
    expect(hexStr(123)).toBeUndefined();
  });

  it('rounds and clamps the size multiplier', () => {
    expect(sizeMultiplier(1.4)).toBe(1);
    expect(sizeMultiplier(4.6)).toBe(5);
    expect(sizeMultiplier(8)).toBe(4);
    expect(sizeMultiplier(20)).toBe(5);
    expect(sizeMultiplier(Number.NaN)).toBeUndefined();
    expect(sizeMultiplier('2')).toBeUndefined();
  });
});
