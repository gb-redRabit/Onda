import { protocol, app } from 'electron';
import { normalize, isAbsolute, sep } from 'path';
import { realpath } from 'fs/promises';
import { SharpService } from './utils/sharp';
import { logger } from '../shared/logger';

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
    }
  }
  return allowedPrefixes;
}

function isAllowedOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol === 'file:') return origin;
  const isLocalDev =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  return isLocalDev ? origin : null;
}

function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  if (allowed) {
    return { 'access-control-allow-origin': allowed };
  }
  return {};
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
      let real = normalized;
      try {
        real = await realpath(normalized);
      } catch {
        // root check below still applies
      }
      const normalizedLower = normalize(real).toLowerCase();
      const prefixes = getAllowedPrefixes();
      const allowed = prefixes.some(
        (p) => normalizedLower === p || normalizedLower.startsWith(p + sep)
      );
      if (!allowed) {
        return new Response('path not allowed', { status: 403 });
      }
      const maxWidth = parseInt(url.searchParams.get('w') || '0');
      const thumbSize = parseInt(url.searchParams.get('t') || '0');
      const cors = corsHeaders(req.headers.get('origin'));

      if (thumbSize > 0) {
        const buf = await SharpService.getThumbnail(real, thumbSize);
        if (buf) {
          return new Response(new Uint8Array(buf), {
            headers: {
              'content-type': 'image/jpeg',
              'cache-control': 'private, max-age=86400',
              ...cors
            }
          });
        }
        return new Response('', { status: 404 });
      }

      if (maxWidth > 0 && maxWidth < 4000) {
        const buf = await SharpService.resize(real, maxWidth);
        if (buf) {
          return new Response(new Uint8Array(buf), {
            headers: {
              'content-type': 'image/jpeg',
              'cache-control': 'private, max-age=3600',
              ...cors
            }
          });
        }
      }

      return new Response('not found', { status: 404 });
    } catch (e) {
      logger.warn('protocol', `onda:// request failed: ${req.url}`, e);
      return new Response('', { status: 500 });
    }
  });
}
