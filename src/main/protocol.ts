import { protocol, app } from 'electron';
import { normalize, isAbsolute, sep } from 'path';
import { realpath } from 'fs/promises';
import { SharpService } from './utils/sharp';
import { allowedAppOrigin } from './utils/origin-guard';
import { isPathWithinAllowedRoots } from './media/media-server';
import { logger } from '../shared/logger';
import { MAX_THUMB_SIZE, MAX_RESIZE_WIDTH } from '../shared/constants';

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
    // normalizuj wszystkie, aby uniknąć niezgodności wielkości liter na Windows
    const paths = [home, docs, music, pics, vids, downloads, desktop, temp];
    for (const p of paths) {
      const n = normalize(p).toLowerCase();
      allowedPrefixes.push(n);
    }
  }
  return allowedPrefixes;
}

function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const allowed = allowedAppOrigin(origin);
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
        // Nie odbijaj ścieżki w odpowiedzi — to wyciek informacji o systemie plików
        // do renderera bez potrzeby.
        return new Response('invalid path', { status: 400 });
      }
      let real = normalized;
      try {
        real = await realpath(normalized);
      } catch {
        // poniższy test korzenia nadal obowiązuje
      }
      const normalizedForPrefix = normalize(real).toLowerCase();
      const prefixes = getAllowedPrefixes();
      // Dozwolone jest to, co leży w katalogach systemowych użytkownika ORAZ
      // w korzeniach serwera mediów (biblioteka + jawnie przyznane katalogi),
      // żeby obrazy z biblioteki na innym wolumenie (np. D:\Zdjęcia) nie dawały 403.
      const allowed =
        isPathWithinAllowedRoots(real) ||
        prefixes.some((p) => normalizedForPrefix === p || normalizedForPrefix.startsWith(p + sep));
      if (!allowed) {
        return new Response('path not allowed', { status: 403 });
      }
      // Parametry zapytania napędzają pracę sharp — ogranicz, aby renderer nigdy
      // nie zażądał nieograniczonego przetwarzania obrazu przez handler onda://.
      const maxWidth = Math.min(
        parseInt(url.searchParams.get('w') || '0', 10) || 0,
        MAX_RESIZE_WIDTH
      );
      const thumbSize = Math.min(
        parseInt(url.searchParams.get('t') || '0', 10) || 0,
        MAX_THUMB_SIZE
      );
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
