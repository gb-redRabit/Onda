import { describe, expect, it } from 'vitest';
import {
  asString,
  buildSourceUrl,
  dotGet,
  resolvePathTemplate,
  resolveTemplate
} from '../source-url';
import type { MediaSource, SourceEndpoint } from '../types/sources';

const source = (baseUrl = 'https://api.example.com/'): MediaSource =>
  ({
    id: 's1',
    name: 'S',
    baseUrl,
    auth: { type: 'none' },
    endpoints: [],
    createdAt: 0
  }) as MediaSource;

const endpoint = (overrides: Partial<SourceEndpoint> = {}): SourceEndpoint =>
  ({
    id: 'e1',
    name: 'E',
    method: 'GET',
    path: '/list',
    mapping: { fields: {} },
    ...overrides
  }) as SourceEndpoint;

describe('dotGet', () => {
  it('returns undefined for missing paths or null roots', () => {
    expect(dotGet({ a: 1 }, undefined)).toBeUndefined();
    expect(dotGet({ a: 1 }, '')).toBeUndefined();
    expect(dotGet(null, 'a')).toBeUndefined();
    expect(dotGet({ a: null }, 'a.b')).toBeUndefined();
    expect(dotGet({ a: 1 }, 'a..b')).toBeUndefined();
  });

  it('reads object and array segments', () => {
    const obj = { a: { b: [{ c: 5 }] } };
    expect(dotGet(obj, 'a.b.0.c')).toBe(5);
    expect(dotGet(obj, 'a.b.9.c')).toBeUndefined();
    expect(dotGet(obj, 'a.b.x')).toBeUndefined();
    expect(dotGet(obj, 'a.b.-1')).toBeUndefined();
    expect(dotGet({ a: 1 }, 'a.b')).toBeUndefined();
  });
});

describe('asString', () => {
  it('converts primitives and rejects objects', () => {
    expect(asString('x')).toBe('x');
    expect(asString(2)).toBe('2');
    expect(asString(false)).toBe('false');
    expect(asString({})).toBeUndefined();
    expect(asString(undefined)).toBeUndefined();
  });
});

describe('template resolution', () => {
  it('keeps templates without an object context', () => {
    expect(resolveTemplate('{a}', null)).toBe('{a}');
    expect(resolveTemplate('{a}', 'text')).toBe('{a}');
  });

  it('substitutes found values and keeps missing placeholders', () => {
    expect(resolveTemplate('x {a} {b} {c}', { a: 1, b: false, c: null })).toBe('x 1 false {c}');
  });

  it('encodes path templates only when they contain braces', () => {
    expect(resolvePathTemplate('/a/{id}', null)).toBe('/a/{id}');
    expect(resolvePathTemplate('/a', { id: 1 })).toBe('/a');
    expect(resolvePathTemplate('/a/{id}/{missing}', { id: 'x y' })).toBe('/a/x%20y/{missing}');
  });
});

describe('buildSourceUrl', () => {
  it('joins base and relative paths and strips trailing slashes', () => {
    expect(buildSourceUrl(source(), endpoint({ path: 'list' }))).toBe(
      'https://api.example.com/list'
    );
    expect(buildSourceUrl(source(), endpoint({ path: '/list' }))).toBe(
      'https://api.example.com/list'
    );
  });

  it('keeps absolute endpoint URLs', () => {
    expect(buildSourceUrl(source(), endpoint({ path: 'https://cdn.example/x' }))).toBe(
      'https://cdn.example/x'
    );
    expect(buildSourceUrl(source(), endpoint({ path: 'http://cdn.example/x' }))).toBe(
      'http://cdn.example/x'
    );
  });

  it('returns the bare url for POST', () => {
    expect(
      buildSourceUrl(
        source(),
        endpoint({ method: 'POST', params: { a: '{x}' }, pagination: { pageParam: 'p' } }),
        { context: { x: 1 }, page: 2 }
      )
    ).toBe('https://api.example.com/list');
  });

  it('adds templated params, query and pagination', () => {
    const url = buildSourceUrl(
      source(),
      endpoint({
        params: { a: '{x}', fixed: 'v' },
        pagination: { pageParam: 'page' }
      }),
      { context: { x: 7 }, query: { q: 'z' }, page: 3 }
    );
    expect(url).toBe('https://api.example.com/list?a=7&fixed=v&q=z&page=3');
  });

  it('uses the page token and appends to urls with a query', () => {
    const url = buildSourceUrl(
      source(),
      endpoint({ path: '/list?static=1', pagination: { pageParam: 'cursor' } }),
      { pageToken: 'tok' }
    );
    expect(url).toBe('https://api.example.com/list?static=1&cursor=tok');
  });

  it('omits pagination without page or token', () => {
    const url = buildSourceUrl(source(), endpoint({ pagination: { pageParam: 'page' } }), {});
    expect(url).toBe('https://api.example.com/list');
  });
});
