import { describe, it, expect } from 'vitest';
import { asPositiveNumber, asNonEmptyString, asBoolean, asStringArray } from '../store-guards';

describe('store guards', () => {
  it('accepts only positive finite numbers', () => {
    expect(asPositiveNumber(5000)).toBe(5000);
    expect(asPositiveNumber(0)).toBeUndefined();
    expect(asPositiveNumber(-1)).toBeUndefined();
    expect(asPositiveNumber(Number.NaN)).toBeUndefined();
    expect(asPositiveNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(asPositiveNumber('5000')).toBeUndefined();
    expect(asPositiveNumber(undefined)).toBeUndefined();
  });

  it('accepts non-empty strings', () => {
    expect(asNonEmptyString('pl')).toBe('pl');
    expect(asNonEmptyString('')).toBeUndefined();
    expect(asNonEmptyString(5)).toBeUndefined();
  });

  it('validates booleans and string arrays', () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean('true')).toBeUndefined();
    expect(asStringArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(asStringArray(['a', 1])).toBeUndefined();
    expect(asStringArray('a')).toBeUndefined();
  });
});
