import { protocol, app } from 'electron';
import { normalize, isAbsolute } from 'path';
import { SharpService } from './utils/sharp';

const allowedPrefixes: string[] = [];

function getAllowedPrefixes(): string[] {
  if (allowedPrefixes.length === 0) {
    const home = app.getPath('home');
    const docs = app.getPath('documents');
    const music = app.getPath('music');
    const pics = app.getPath('pictures');
    const vids = app.getPath('videos');
    const downloads = app.getPath('downloads');
    const desktop = app.getPath('desktop');
    const temp = app.getPath('temp');
    // normalize all to avoid case mismatch on Windows
    const paths = [home, docs, music, pics, vids, downloads, desktop, temp];
    for (const p of paths) {
      const n = normalize(p).toLowerCase();
      allowedPrefixes.push(n);
      // on Windows also add the root letter (e.g. D:\)
      if (process.platform === 'win32' && /^[A-Z]:\\/i.test(n)) {
        allowedPrefixes.push(n.slice(0, 3)); // "D:\"
      }
    }
  }
  return allowedPrefixes;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'onda',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

export function registerOndaProtocolHandler(): void {
  protocol.handle('onda', async (req) => {
    try {
      const url = new URL(req.url);
      const rawPath = url.searchParams.get('path') || '';
      if (!rawPath) return new Response('missing path', { status: 400 });
      const normalized = normalize(rawPath);
      if (!isAbsolute(normalized)) {
        return new Response(`invalid path: ${normalized}`, { status: 400 });
      }
      const normalizedLower = normalized.toLowerCase();
      const prefixes = getAllowedPrefixes();
      if (!prefixes.some((p) => normalizedLower.startsWith(p))) {
        return new Response('path not allowed', { status: 403 });
      }
      const maxWidth = parseInt(url.searchParams.get('w') || '0');
      const thumbSize = parseInt(url.searchParams.get('t') || '0');

      if (thumbSize > 0) {
        const buf = await SharpService.getThumbnail(normalized, thumbSize);
        if (buf) {
          return new Response(new Uint8Array(buf), {
            headers: {
              'content-type': 'image/jpeg',
              'cache-control': 'private, max-age=86400',
              'access-control-allow-origin': '*'
            }
          });
        }
        return new Response('', { status: 404 });
      }

      if (maxWidth > 0 && maxWidth < 4000) {
        const buf = await SharpService.resize(normalized, maxWidth);
        if (buf) {
          return new Response(new Uint8Array(buf), {
            headers: {
              'content-type': 'image/jpeg',
              'cache-control': 'private, max-age=3600',
              'access-control-allow-origin': '*'
            }
          });
        }
      }

      return new Response('not found', { status: 404 });
    } catch {
      return new Response('', { status: 500 });
    }
  });
}
