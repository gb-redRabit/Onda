import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSourcesTest } from '../test';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';

const originalApi = window.api;

afterEach(() => {
  window.api = originalApi;
  vi.useRealTimers();
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

  it('sends plain copies with the context and raw flag', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const invoke = vi.fn().mockResolvedValue({ success: true });
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await test.testSource(source, endpoint, { page: 2 }, true);

    expect(invoke).toHaveBeenCalledWith(
      'sources:test',
      expect.objectContaining({ id: 's1' }),
      expect.objectContaining({ id: 'e1' }),
      { page: 2 },
      true
    );
    const sent = invoke.mock.calls[0]![1] as MediaSource;
    expect(sent).not.toBe(source);
    expect(test.testStatus.value[source.id]).toMatchObject({ at: 1000, ms: 0 });
  });

  it('sends null for a missing endpoint and context', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await test.testSource(source);

    expect(invoke).toHaveBeenCalledWith('sources:test', expect.any(Object), null, null, false);
  });

  it('stringifies non-Error failures', async () => {
    const invoke = vi.fn().mockRejectedValue('plain failure');
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await test.testSource(source);

    expect(test.testStatus.value[source.id]).toMatchObject({
      success: false,
      error: 'plain failure'
    });
  });

  it('flags the source as checking while the request is in flight', async () => {
    let release!: (value: unknown) => void;
    const invoke = vi.fn(() => new Promise((resolve) => (release = resolve)));
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    const pending = test.testSource(source);
    expect(test.checking.value[source.id]).toBe(true);

    release({ success: true });
    await pending;
    expect(test.checking.value[source.id]).toBe(false);
  });
});

describe('createSourcesTest table rows', () => {
  it('returns rows and forwards the context wrapper', async () => {
    const rows: SourceItem[] = [{ id: 'i1', title: 'Row', type: 'video' }];
    const invoke = vi.fn().mockResolvedValue(rows);
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await expect(test.tableRowsTest(source, endpoint, { q: 1 })).resolves.toEqual(rows);
    expect(invoke).toHaveBeenCalledWith(
      'sources:tableRows',
      expect.objectContaining({ id: 's1' }),
      expect.objectContaining({ id: 'e1' }),
      { context: { q: 1 } }
    );
  });

  it('passes an undefined context when omitted', async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await test.tableRowsTest(source, endpoint);
    expect(invoke.mock.calls[0]![3]).toEqual({ context: undefined });
  });

  it('returns an empty list on failure', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('boom'));
    window.api = { invoke } as unknown as Window['api'];
    const test = createSourcesTest();

    await expect(test.tableRowsTest(source, endpoint)).resolves.toEqual([]);
  });
});
