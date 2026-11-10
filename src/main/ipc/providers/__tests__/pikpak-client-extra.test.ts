import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../provider-rate-limit', () => ({ throttleProvider: async () => undefined }));

import { PikPakClient, PikPakError } from '../pikpak/pikpak-client';

type Init = { method?: string; headers?: Record<string, string>; signal?: AbortSignal };

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

const fetchMock = vi.fn();

function route(handler: (url: string, init?: Init) => unknown) {
  fetchMock.mockImplementation(async (raw: unknown, init?: Init) => handler(String(raw), init));
}

function withCaptcha(handler: (url: string, init?: Init) => unknown) {
  route((url, init) => {
    if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
    return handler(url, init);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('access token refresh', () => {
  it('throws when the response has no token', async () => {
    route(() => json({}));
    const client = new PikPakClient();

    await expect(client.refreshAccessToken('R')).rejects.toMatchObject({
      message: 'refresh: brak access_token',
      status: 200
    });
  });

  it('aborts the request after the timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: unknown, init?: Init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const client = new PikPakClient();

    const promise = client.refreshAccessToken('R');
    const assertion = expect(promise).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

describe('captcha failures', () => {
  it('reports non-JSON captcha responses with a status', async () => {
    route(() => json('server exploded', 500));
    const client = new PikPakClient();

    await expect(client.listFolder('S')).rejects.toMatchObject({
      message: 'captcha/init 500: server exploded',
      status: 500,
      retryable: true
    });
  });

  it('uses the error description when present', async () => {
    route((url) => {
      if (url.includes('captcha/init')) {
        return json({ error_description: 'blocked' }, 403);
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).rejects.toMatchObject({
      message: 'captcha/init 403: blocked'
    });
  });
});

describe('GET request errors', () => {
  it('retries once on error_code 9 and refreshes captcha', async () => {
    let detailCalls = 0;
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('share/detail')) {
        detailCalls += 1;
        if (detailCalls === 1) return json({ error_code: 9 });
        return json({ share_status: 'OK', files: [{ id: 'f1', name: 'a.mp4' }] });
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).resolves.toHaveLength(1);
    expect(detailCalls).toBe(2);
  });

  it('rejects missing JSON with a retryable error', async () => {
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      return json('', 500);
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).rejects.toMatchObject({
      message: 'Brak JSON (500)',
      status: 500,
      retryable: true
    });
  });

  it('propagates business API errors without retrying', async () => {
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      return json({ error_code: 5, error_description: 'denied' });
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).rejects.toMatchObject({
      message: 'API 5: denied',
      code: 5
    });
  });

  it('falls back to the error field', async () => {
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      return json({ error_code: 7, error: 'fallback' });
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).rejects.toMatchObject({ message: 'API 7: fallback' });
  });
});

describe('POST request errors', () => {
  it('retries restore on error_code 9', async () => {
    let restoreCalls = 0;
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('share/restore')) {
        restoreCalls += 1;
        return restoreCalls === 1 ? json({ error_code: 9 }) : json({ ok: true });
      }
      if (url.includes('/drive/v1/events')) {
        return json({ events: [{ type: 'TYPE_RESTORE', file_id: 'NEW1', file_name: 'a' }] });
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.restoreToDrive('S', 'F', 'a')).resolves.toBe('NEW1');
    expect(restoreCalls).toBe(2);
  });

  it('rejects missing POST JSON', async () => {
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      return json('', 502);
    });
    const client = new PikPakClient();

    await expect(client.cleanupDriveFiles(['A'])).rejects.toMatchObject({
      message: 'Brak JSON (502)',
      retryable: true
    });
  });

  it('propagates POST business errors', async () => {
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      return json({ error_code: 7, error_description: 'bad' });
    });
    const client = new PikPakClient();

    await expect(client.cleanupDriveFiles(['A'])).rejects.toMatchObject({
      message: 'API 7: bad',
      code: 7
    });
  });
});

describe('restore and drive helpers', () => {
  it('times out when the restore event never appears', async () => {
    vi.useFakeTimers();
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('share/restore')) return json({ ok: true });
      if (url.includes('/drive/v1/events')) return json({ events: [] });
      return json({});
    });
    const client = new PikPakClient();

    const promise = client.restoreToDrive('S', 'F');
    const assertion = expect(promise).rejects.toThrow('restore: nie znaleziono pliku w events');
    await vi.advanceTimersByTimeAsync(70_000);
    await assertion;
  });

  it('returns the direct drive URL', async () => {
    withCaptcha((url) => {
      if (url.includes('/drive/v1/files/ID')) {
        return json({ size: 10, web_content_link: 'https://dl/drive' });
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.getDriveFileUrl('ID')).resolves.toBe('https://dl/drive');
  });

  it('polls until the drive file has size', async () => {
    vi.useFakeTimers();
    let calls = 0;
    withCaptcha((url) => {
      if (url.includes('/drive/v1/files/ID')) {
        calls += 1;
        if (calls === 1) return json({ size: 0 });
        return json({ size: 12, web_content_link: 'https://dl/ready' });
      }
      return json({});
    });
    const client = new PikPakClient();

    const promise = client.waitDriveFileUrl('ID', 60_000);
    await vi.advanceTimersByTimeAsync(4000);

    await expect(promise).resolves.toBe('https://dl/ready');
    expect(calls).toBe(2);
  });

  it('skips cleanup for an empty list', async () => {
    const client = new PikPakClient();
    await client.cleanupDriveFiles([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still succeeds when permanent delete fails', async () => {
    withCaptcha((url) => {
      if (url.includes('files:batchTrash')) return json({ ok: true });
      if (url.includes('files:batchDelete')) return json('', 500);
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.cleanupDriveFiles(['A'])).resolves.toBeUndefined();
  });

  it('returns the thumbnail URL when file info lacks a direct link', async () => {
    withCaptcha((url) => {
      if (url.includes('share/file_info')) {
        return json({ file_info: { name: 'clip.mp4' } });
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.getShareFileMeta('S', 'F')).resolves.toEqual({
      name: 'clip.mp4',
      url: undefined
    });
  });

  it('throws when neither authenticated nor anonymous file info yields a URL', async () => {
    withCaptcha((url) => {
      if (url.includes('share/file_info')) return json({ file_info: {} });
      return json({});
    });
    const client = new PikPakClient();
    client.setAccessToken('TOK');

    await expect(client.getFileInfo('S', 'F')).rejects.toThrow('Brak bezpośredniego URL dla pliku');
  });
});

describe('share listing pagination', () => {
  it('follows pages until the token repeats', async () => {
    let detailCalls = 0;
    route((url) => {
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('share/detail')) {
        detailCalls += 1;
        if (detailCalls === 1) {
          return json({
            share_status: 'OK',
            files: [{ id: 'a', name: 'a.mp4' }],
            next_page_token: 'p2'
          });
        }
        return json({
          share_status: 'OK',
          files: [{ id: 'b', name: 'b.mp4' }],
          next_page_token: 'p2'
        });
      }
      return json({});
    });
    const client = new PikPakClient();

    await expect(client.listFolder('S')).resolves.toHaveLength(2);
    expect(detailCalls).toBe(2);
  });
});

describe('error taxonomy', () => {
  it('keeps PikPakError metadata', () => {
    const error = new PikPakError('x', { status: 500, code: 9, retryable: true });
    expect(error).toMatchObject({ name: 'PikPakError', status: 500, code: 9, retryable: true });
    expect(error).toBeInstanceOf(Error);
  });
});
