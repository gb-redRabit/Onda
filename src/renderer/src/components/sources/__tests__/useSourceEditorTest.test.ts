import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSourceEditorTest } from '../useSourceEditorTest';
import type { MediaSource, SourceEndpoint } from '@renderer/types/sources';

const state = vi.hoisted(() => ({
  collectFieldPaths: vi.fn(),
  applyPassKeys: vi.fn(),
  tableRowPassContext: vi.fn()
}));

vi.mock('../endpointDraft', () => ({ collectFieldPaths: state.collectFieldPaths }));
vi.mock('@renderer/utils/sourceUrl', () => ({ applyPassKeys: state.applyPassKeys }));
vi.mock('@renderer/utils/sourcesNav', () => ({
  tableRowPassContext: state.tableRowPassContext
}));

function endpoint(id: string, overrides: Partial<SourceEndpoint> = {}): SourceEndpoint {
  return {
    id,
    name: id,
    method: 'GET',
    path: `/${id}`,
    mapping: { fields: {} },
    ...overrides
  } as SourceEndpoint;
}

function builtSource(endpoints: SourceEndpoint[]): MediaSource {
  return {
    id: 's1',
    name: 'Source',
    baseUrl: 'https://api',
    auth: { type: 'none' },
    endpoints,
    createdAt: 0
  };
}

function draftEndpoint(id: string, overrides: Record<string, unknown> = {}) {
  return { id, type: 'list', tableEnabled: false, ...overrides };
}

function setup(
  options: {
    built?: MediaSource | null;
    draft?: Array<Record<string, unknown>>;
  } = {}
) {
  const draft = {
    endpoints: options.draft ?? [draftEndpoint('e1'), draftEndpoint('e2')]
  };
  const sources = {
    testSource: vi.fn(),
    tableRowsTest: vi.fn()
  };
  const buildSource = vi.fn(() =>
    options.built === undefined ? builtSource([endpoint('e1'), endpoint('e2')]) : options.built
  );
  const t = vi.fn((key: string) => key);
  const api = useSourceEditorTest({
    sources: sources as never,
    draft: draft as never,
    buildSource,
    t
  });
  return { api, sources, buildSource, t, draft };
}

beforeEach(() => {
  state.collectFieldPaths.mockReset();
  state.collectFieldPaths.mockImplementation((obj: unknown) => Object.keys(obj ?? {}));
  state.applyPassKeys.mockReset();
  state.applyPassKeys.mockImplementation((raw: unknown) => ({ applied: raw }));
  state.tableRowPassContext.mockReset();
  state.tableRowPassContext.mockReturnValue({ rowContext: true });
});

describe('onTest', () => {
  it('tests the first level without context and stores samples', async () => {
    const { api, sources } = setup();
    sources.testSource.mockResolvedValueOnce({
      success: true,
      raw: { raw: true },
      headers: { h: 'v' },
      sample: { extra: { a: 1 } }
    });

    await api.onTest(0);

    expect(sources.testSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'e1' }),
      undefined,
      true
    );
    expect(api.testPassed.value).toBe(true);
    expect(api.testMsg.value).toBe('sources.testOk');
    expect(api.testRaw.value).toEqual({ raw: true });
    expect(api.headerRows.value).toEqual([['h', 'v']]);
    expect(api.sampleFields.value.e1).toEqual(['a']);
    expect(api.pageSamples.value.e1).toEqual({ a: 1 });
    expect(api.endpointStatus.value).toEqual({ e1: true });
    expect(api.testingId.value).toBe('');
  });

  it('falls back to the sample when no raw payload is present', async () => {
    const { api, sources } = setup();
    sources.testSource.mockResolvedValueOnce({
      success: true,
      sample: { extra: { a: 1 } }
    });
    await api.onTest(0);
    expect(api.testRaw.value).toEqual({ a: 1 });
  });

  it('reports failures with the server error or a fallback', async () => {
    const { api, sources, t } = setup();
    sources.testSource.mockResolvedValueOnce({ success: false, error: 'boom' });
    await api.onTest(0);

    expect(api.testPassed.value).toBe(false);
    expect(t).toHaveBeenCalledWith('sources.testFail', { err: 'boom' });
    expect(api.endpointStatus.value.e1).toBe(false);
    expect(api.testRaw.value).toBeNull();

    sources.testSource.mockResolvedValueOnce({ success: false });
    await api.onTest(0);
    expect(t).toHaveBeenLastCalledWith('sources.testFail', { err: 'unknown' });
  });

  it('does nothing without a built source or endpoint', async () => {
    let { api, sources } = setup({ built: null });
    await api.onTest(0);
    expect(sources.testSource).not.toHaveBeenCalled();

    ({ api, sources } = setup());
    await api.onTest(5);
    expect(sources.testSource).not.toHaveBeenCalled();
  });

  it('uses a table-row context for a page table child', async () => {
    const parentEndpoint = endpoint('e1', {
      type: 'page',
      table: { mode: 'endpoint', path: '/rows' }
    });
    const childEndpoint = endpoint('e2');
    const { api, sources } = setup({
      built: builtSource([parentEndpoint, childEndpoint]),
      draft: [
        draftEndpoint('e1', { type: 'page', tableEnabled: true, tableChildId: 'e2' }),
        draftEndpoint('e2')
      ]
    });
    sources.testSource
      .mockResolvedValueOnce({ success: true, sample: { extra: { slug: 'x' } } })
      .mockResolvedValueOnce({ success: true, sample: { extra: { title: 'child' } } });
    sources.tableRowsTest.mockResolvedValueOnce([{ id: 'row', extra: { n: 1 } }]);

    await api.onTest(1);

    expect(sources.tableRowsTest).toHaveBeenCalledWith(expect.anything(), parentEndpoint, {
      slug: 'x'
    });
    expect(state.tableRowPassContext).toHaveBeenCalledWith(
      { slug: 'x' },
      { id: 'row', extra: { n: 1 } },
      parentEndpoint,
      parentEndpoint.table
    );
    expect(sources.testSource).toHaveBeenLastCalledWith(
      expect.anything(),
      childEndpoint,
      { rowContext: true },
      true
    );
  });

  it('falls back to passing keys for list children', async () => {
    const parentEndpoint = endpoint('e1', {
      passKeys: [{ from: 'slug', as: 'slug', type: 'string' }]
    });
    const childEndpoint = endpoint('e2');
    const { api, sources } = setup({
      built: builtSource([parentEndpoint, childEndpoint])
    });
    sources.testSource
      .mockResolvedValueOnce({ success: true, sample: { extra: { slug: 'abc' } } })
      .mockResolvedValueOnce({ success: true });

    await api.onTest(1);

    expect(state.applyPassKeys).toHaveBeenCalledWith({ slug: 'abc' }, parentEndpoint.passKeys);
    expect(sources.testSource).toHaveBeenLastCalledWith(
      expect.anything(),
      childEndpoint,
      { applied: { slug: 'abc' } },
      true
    );
  });

  it('reuses cached parent samples and handles missing samples or rows', async () => {
    const parentEndpoint = endpoint('e1');
    const childEndpoint = endpoint('e2');
    const { api, sources } = setup({
      built: builtSource([parentEndpoint, childEndpoint])
    });
    api.pageSamples.value = { e1: { slug: 'cached' } };
    sources.testSource.mockResolvedValueOnce({ success: true });

    await api.onTest(1);
    expect(sources.testSource).toHaveBeenCalledTimes(1);
    expect(state.applyPassKeys).toHaveBeenCalledWith({ slug: 'cached' }, parentEndpoint.passKeys);

    // No extra payload from the parent sample.
    const second = setup({ built: builtSource([parentEndpoint, childEndpoint]) });
    second.sources.testSource
      .mockResolvedValueOnce({ success: true, sample: { extra: undefined } })
      .mockResolvedValueOnce({ success: true });
    await second.api.onTest(1);
    expect(second.sources.testSource).toHaveBeenLastCalledWith(
      expect.anything(),
      childEndpoint,
      undefined,
      true
    );
  });

  it('returns a null context when a table has no rows', async () => {
    const parentEndpoint = endpoint('e1', {
      type: 'page',
      table: { mode: 'endpoint', path: '/rows' }
    });
    const childEndpoint = endpoint('e2');
    const { api, sources } = setup({
      built: builtSource([parentEndpoint, childEndpoint]),
      draft: [
        draftEndpoint('e1', { type: 'page', tableEnabled: true, tableChildId: 'e2' }),
        draftEndpoint('e2')
      ]
    });
    sources.testSource
      .mockResolvedValueOnce({ success: true, sample: { extra: { a: 1 } } })
      .mockResolvedValueOnce({ success: true });
    sources.tableRowsTest.mockResolvedValueOnce([]);

    await api.onTest(1);
    expect(sources.testSource).toHaveBeenLastCalledWith(
      expect.anything(),
      childEndpoint,
      undefined,
      true
    );
  });

  it('ignores samples without an extra payload', async () => {
    const { api, sources } = setup();
    sources.testSource.mockResolvedValueOnce({ success: true, sample: { extra: undefined } });

    await api.onTest(0);
    expect(api.sampleFields.value.e1).toEqual([]);
    expect(api.pageSamples.value).toEqual({});
  });
});

describe('onTestTable', () => {
  it('requires a built source, endpoint and cached context', async () => {
    const first = setup({ built: null });
    await first.api.onTestTable(0);
    expect(first.sources.tableRowsTest).not.toHaveBeenCalled();

    const second = setup({ built: builtSource([]) });
    await second.api.onTestTable(0);
    expect(second.sources.tableRowsTest).not.toHaveBeenCalled();

    const third = setup();
    await third.api.onTestTable(1);
    expect(third.api.testPassed.value).toBe(false);
    expect(third.api.testMsg.value).toBe('sources.testTableHint');
  });

  it('tests table rows and stores field samples', async () => {
    const built = builtSource([
      endpoint('e1', { type: 'page', table: { mode: 'endpoint', path: '/rows' } }),
      endpoint('e2')
    ]);
    const { api, sources } = setup({ built });
    api.pageSamples.value = { e1: { page: true } };
    sources.tableRowsTest.mockResolvedValueOnce([{ id: 'r', extra: { a: 1, b: 2 } }]);

    await api.onTestTable(0);

    expect(sources.tableRowsTest).toHaveBeenCalledWith(built, built.endpoints[0], { page: true });
    expect(api.testPassed.value).toBe(true);
    expect(api.testMsg.value).toBe('sources.testTableOk');
    expect(api.rowSamples.value.e1).toEqual(['a', 'b']);
    expect(api.tableTestingId.value).toBe('');
  });

  it('reports empty tables without row samples', async () => {
    const built = builtSource([endpoint('e1')]);
    const { api, sources } = setup({ built });
    api.pageSamples.value = { e1: { page: true } };
    sources.tableRowsTest.mockResolvedValueOnce([]);

    await api.onTestTable(0);
    expect(api.testPassed.value).toBe(false);
    expect(api.testMsg.value).toBe('sources.testTableFail');
    expect(api.rowSamples.value).toEqual({});
  });

  it('keeps successful tables without extra row data', async () => {
    const built = builtSource([endpoint('e1')]);
    const { api, sources } = setup({ built });
    api.pageSamples.value = { e1: { page: true } };
    sources.tableRowsTest.mockResolvedValueOnce([{ id: 'r' }]);

    await api.onTestTable(0);
    expect(api.testPassed.value).toBe(true);
    expect(api.rowSamples.value).toEqual({});
  });
});

describe('pretty raw and headers', () => {
  it('formats raw JSON and falls back for unserialisable values', () => {
    const { api } = setup();

    expect(api.prettyRaw.value).toBe('');
    api.testRaw.value = { a: 1 };
    expect(api.prettyRaw.value).toBe('{\n  "a": 1\n}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    api.testRaw.value = circular;
    expect(api.prettyRaw.value).toBe('[object Object]');
  });

  it('exposes header rows from the current headers', () => {
    const { api } = setup();
    api.testHeaders.value = { a: '1', b: '2' };
    expect(api.headerRows.value).toEqual([
      ['a', '1'],
      ['b', '2']
    ]);
  });
});
