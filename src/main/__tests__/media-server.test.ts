import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import { join, dirname } from 'path';
import {
  createMediaServer,
  setAllowedRoots,
  addAllowedRoot,
  getExtraRoots,
  isAllowedStreamHost,
  validateStreamUrl
} from '../media-server';
import type { MediaServer } from '../media-server';

let server: MediaServer | null = null;
const tempFiles: string[] = [];

async function makeTempFile(size: number): Promise<string> {
  const filePath = join(
    os.tmpdir(),
    `onda-ms-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  );
  await fs.writeFile(filePath, Buffer.alloc(size, 0x41));
  tempFiles.push(filePath);
  return filePath;
}

function request(
  pathname: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server!.port,
        path: pathname,
        method: opts.method || 'GET',
        agent: false,
        headers: { connection: 'close', ...opts.headers }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('request timeout'));
    });
    req.end();
  });
}

beforeAll(async () => {
  server = await createMediaServer();
  await setAllowedRoots([os.tmpdir()]);
});

afterAll(async () => {
  const s = server;
  server = null;
  if (s) {
    await Promise.race([
      new Promise<void>((resolve) =>
        (s as unknown as { close: (cb: () => void) => void }).close(() => resolve())
      ),
      new Promise<void>((resolve) => {
        (s as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        (s as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.();
        setTimeout(resolve, 2000);
      })
    ]);
  }
  for (const f of tempFiles.splice(0)) {
    await fs.unlink(f).catch(() => {});
  }
});

describe('media-server', () => {
  it('rejects requests without a valid token', async () => {
    const file = await makeTempFile(64);

    const noToken = await request('/?path=' + encodeURIComponent(file));
    expect(noToken.status).toBe(403);

    const badToken = await request('/wrong-token/?path=' + encodeURIComponent(file));
    expect(badToken.status).toBe(403);
  });

  it('rejects requests missing the path parameter', async () => {
    const res = await request(`/${server!.token}/`);
    expect(res.status).toBe(400);
  });

  it('rejects non-absolute paths', async () => {
    const res = await request(`/${server!.token}/?path=relative%2Ffile.mp4`);
    expect(res.status).toBe(400);
  });

  it('serves the full file with correct content-type and length', async () => {
    const file = await makeTempFile(1024);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-length']).toBe('1024');
    expect(res.body).toHaveLength(1024);
    expect(res.body.every((b) => b === 0x41)).toBe(true);
  });

  it('serves a byte range request', async () => {
    const file = await makeTempFile(1024);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { range: 'bytes=10-19' }
    });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 10-19/1024');
    expect(res.headers['content-length']).toBe('10');
    expect(res.body).toHaveLength(10);
  });

  it('serves an open-ended byte range request', async () => {
    const file = await makeTempFile(100);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { range: 'bytes=90-' }
    });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 90-99/100');
    expect(res.body).toHaveLength(10);
  });

  it('serves a suffix range request (bytes=-N)', async () => {
    const file = await makeTempFile(100);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { range: 'bytes=-10' }
    });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 90-99/100');
    expect(res.body).toHaveLength(10);
  });

  it('rejects invalid range headers with 416', async () => {
    const file = await makeTempFile(100);
    for (const range of ['bytes=abc', 'bytes=-0', 'garbage']) {
      const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
        headers: { range }
      });
      expect(res.status).toBe(416);
    }
  });

  it('rejects ranges beyond the file size with 416', async () => {
    const file = await makeTempFile(100);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { range: 'bytes=999999-' }
    });
    expect(res.status).toBe(416);
  });

  it('rejects ranges where start exceeds end with 416', async () => {
    const file = await makeTempFile(100);
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { range: 'bytes=50-10' }
    });
    expect(res.status).toBe(416);
  });

  it('blocks foreign origins and echoes allowed local origins', async () => {
    const file = await makeTempFile(16);

    const foreign = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { origin: 'https://evil.example' }
    });
    expect(foreign.status).toBe(403);

    const local = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`, {
      headers: { origin: 'http://localhost:5173' }
    });
    expect(local.status).toBe(200);
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers OPTIONS preflight with 204', async () => {
    const res = await request(`/${server!.token}/?path=${encodeURIComponent('C:/x.mp4')}`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' }
    });
    expect(res.status).toBe(204);
  });

  it('returns 500 for an unreadable file inside an allowed root', async () => {
    const missing = join(os.tmpdir(), 'no-such-file-onda.mp4');
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(missing)}`);
    expect(res.status).toBe(500);
  });

  it('rejects paths outside the allowed roots (fail-closed)', async () => {
    const outside =
      process.platform === 'win32' ? 'C:/Windows/System32/notepad.exe' : '/etc/hostname';
    const res = await request(`/${server!.token}/?path=${encodeURIComponent(outside)}`);
    expect(res.status).toBe(403);
  });

  it('serves a path granted via addAllowedRoot (extra roots)', async () => {
    const parent = dirname(os.tmpdir());
    const dir = join(parent, `onda-extra-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    tempFiles.push(dir);
    const file = join(dir, 'granted.mp3');
    await fs.writeFile(file, Buffer.alloc(64, 0x41));
    tempFiles.push(file);

    const denied = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`);
    expect(denied.status).toBe(403);

    await addAllowedRoot(dir);

    const granted = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`);
    expect(granted.status).toBe(200);
    expect(granted.headers['content-type']).toBe('audio/mpeg');
    expect(getExtraRoots()).toContain(dir);
  });

  it('keeps extra roots when library roots are replaced', async () => {
    const parent = dirname(os.tmpdir());
    const dir = join(parent, `onda-keep-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    tempFiles.push(dir);
    const file = join(dir, 'kept.mp4');
    await fs.writeFile(file, Buffer.alloc(64, 0x41));
    tempFiles.push(file);

    await addAllowedRoot(dir);
    await setAllowedRoots([os.tmpdir()]);

    const res = await request(`/${server!.token}/?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(200);
  });
});

describe('media-server /stream proxy', () => {
  it('rejects requests without a url parameter', async () => {
    const res = await request(`/${server!.token}/stream`);
    expect(res.status).toBe(400);
  });

  it('rejects malformed urls', async () => {
    const res = await request(`/${server!.token}/stream?url=${encodeURIComponent('not a url')}`);
    expect(res.status).toBe(400);
  });

  it('rejects non-https and non-allowlisted hosts', async () => {
    const httpUrl = await request(
      `/${server!.token}/stream?url=${encodeURIComponent('http://googlevideo.com/x')}`
    );
    expect(httpUrl.status).toBe(403);

    const evil = await request(
      `/${server!.token}/stream?url=${encodeURIComponent('https://evil.example/x')}`
    );
    expect(evil.status).toBe(403);
  });

  it('allowlists only YouTube media hosts', () => {
    expect(isAllowedStreamHost('rr1.googlevideo.com')).toBe(true);
    expect(isAllowedStreamHost('googlevideo.com')).toBe(true);
    expect(isAllowedStreamHost('i.ytimg.com')).toBe(true);
    expect(isAllowedStreamHost('www.youtube.com')).toBe(true);
    expect(isAllowedStreamHost('evilgooglevideo.com')).toBe(false);
    expect(isAllowedStreamHost('youtube.com.evil.example')).toBe(false);
    expect(isAllowedStreamHost('example.com')).toBe(false);
  });

  it('validates only https urls on allowlisted hosts', () => {
    expect(validateStreamUrl('https://rr1.googlevideo.com/videoplayback?ip=x')?.hostname).toBe(
      'rr1.googlevideo.com'
    );
    expect(validateStreamUrl('http://rr1.googlevideo.com/x')).toBeNull();
    expect(validateStreamUrl('https://evil.example/x')).toBeNull();
    expect(validateStreamUrl('javascript:alert(1)')).toBeNull();
  });
});
