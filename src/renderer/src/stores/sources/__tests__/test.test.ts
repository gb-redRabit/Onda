import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSourcesTest } from '../test';
import type { MediaSource, SourceEndpoint } from '@renderer/types/sources';

const originalApi = window.api;

afterEach(() => {
  window.api = originalApi;
});

const source: MediaSource = {
  id: 's1',
  name: 'S',
  baseUrl: 'https://x.example',
  auth: { type: 'none' },
  createdAt: 0,
  endpoints: []
};

const endpoint: SourceEndpoint = {
  id: 'e1',
  name: 'E',
  method: 'GET',
  path: '/',
  mapping: { fields: {} }
};

describe('createSourcesTest', () => {
  it('records a successful test with timing', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, raw: { ok: true } });
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();
    const res = await test.testSource(source, endpoint);
    expect(res.success).toBe(true);
    expect(test.testStatus.value[source.id]).toMatchObject({ success: true });
    expect(typeof test.testStatus.value[source.id].at).toBe('number');
    expect(typeof test.testStatus.value[source.id].ms).toBe('number');
    expect(test.checking.value[source.id]).toBe(false);
  });

  it('records a failure (including thrown errors) with timing', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('nope'));
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();
    const res = await test.testSource(source, endpoint);
    expect(res.success).toBe(false);
    expect(test.testStatus.value[source.id].error).toBe('nope');
    expect(test.checking.value[source.id]).toBe(false);
  });

  it('forgetSource clears status and checking', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();
    await test.testSource(source, endpoint);
    test.forgetSource(source.id);
    expect(test.testStatus.value[source.id]).toBeUndefined();
    expect(test.checking.value[source.id]).toBeUndefined();
  });
});
