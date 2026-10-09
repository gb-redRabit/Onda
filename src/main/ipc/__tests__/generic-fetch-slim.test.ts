import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { fetchSourceItems } from '../generic-fetch';
import type { MediaSource, SourceEndpoint } from '../../../shared/types/sources';

describe('fetchSourceItems — slim payload', () => {
  it('drops the heavy raw item and ships a resolved passContext', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          items: [{ slug: 'abc', title: 'Series A', huge: { deep: 'x'.repeat(2000) } }]
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const source: MediaSource = {
        id: 's',
        name: 'S',
        baseUrl: origin,
        allowPrivateNetwork: true,
        auth: { type: 'none' },
        endpoints: [],
        createdAt: 0
      };
      const endpoint: SourceEndpoint = {
        id: 'e',
        name: 'E',
        method: 'GET',
        path: '/items',
        mapping: { arrayPath: 'items', fields: { title: 'title' } },
        passKeys: [{ from: 'slug', as: 'slug', type: 'string' }]
      };

      const res = await fetchSourceItems(source, endpoint);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.title).toBe('Series A');
      expect(res.items[0]!.extra).toBeUndefined();
      expect(res.items[0]!.passContext).toEqual({ slug: 'abc' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
