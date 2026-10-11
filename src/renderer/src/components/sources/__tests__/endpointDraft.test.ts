import { describe, expect, it } from 'vitest';
import { buildEndpointFromDraft, emptyEndpoint, endpointFromSource } from '../endpointDraft';
import type { SourceEndpoint } from '@renderer/types/sources';

function endpoint(over: Partial<SourceEndpoint> = {}): SourceEndpoint {
  return {
    id: 'e1',
    name: 'X',
    method: 'GET',
    path: '/x',
    mapping: { fields: {} },
    ...over
  };
}

describe('endpointDraft — view', () => {
  it('defaults a new draft to cards', () => {
    expect(emptyEndpoint().view).toBe('cards');
  });

  it('round-trips a persisted non-default view', () => {
    const draft = endpointFromSource(endpoint({ view: 'player' }));
    expect(draft.view).toBe('player');
    expect(buildEndpointFromDraft(draft)?.view).toBe('player');
  });

  it('omits the default view from the built endpoint', () => {
    const draft = endpointFromSource(endpoint());
    expect(draft.view).toBe('cards');
    expect(buildEndpointFromDraft(draft)?.view).toBeUndefined();
  });

  it('does not drop other fields when a view is set', () => {
    const draft = endpointFromSource(endpoint({ view: 'gallery', name: 'Galeria' }));
    const built = buildEndpointFromDraft(draft);
    expect(built?.name).toBe('Galeria');
    expect(built?.view).toBe('gallery');
  });
});

describe('endpointDraft — table view', () => {
  it('defaults a new draft table view to table', () => {
    expect(emptyEndpoint().tableView).toBe('table');
  });

  it('round-trips a non-default table view', () => {
    const draft = endpointFromSource(
      endpoint({ type: 'page', table: { mode: 'endpoint', rowKey: 'n', view: 'carousel' } })
    );
    expect(draft.tableView).toBe('carousel');
    expect(buildEndpointFromDraft(draft)?.table?.view).toBe('carousel');
  });

  it('omits the default table view', () => {
    const draft = endpointFromSource(
      endpoint({ type: 'page', table: { mode: 'endpoint', rowKey: 'n' } })
    );
    expect(draft.tableView).toBe('table');
    expect(buildEndpointFromDraft(draft)?.table?.view).toBeUndefined();
  });
});
