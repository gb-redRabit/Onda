import { describe, expect, it } from 'vitest';
import { runPluginFetch } from '../plugins-fetch';

describe('plugin network fetch', () => {
  it('rejects a manifest-allowed URL that resolves to loopback before making a request', async () => {
    const result = await runPluginFetch(
      ['http://127.0.0.1:8123/*'],
      'http://127.0.0.1:8123/private',
      {
        method: 'GET'
      }
    );

    expect(result).toMatchObject({ success: false, code: 'forbidden' });
    expect(result.error).toContain('Private network address is not allowed');
  });

  it('still rejects a URL outside the declared manifest patterns', async () => {
    const result = await runPluginFetch(
      ['https://api.example.test/*'],
      'https://other.example.test/data',
      { method: 'GET' }
    );

    expect(result).toMatchObject({
      success: false,
      code: 'forbidden',
      error: 'URL not permitted by plugin allowlist'
    });
  });
});
