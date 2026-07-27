import { protocol } from 'electron';
import { normalize, isAbsolute } from 'path';
import { SharpService } from './utils/sharp';

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
