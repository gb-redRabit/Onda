import http from 'http';
import fs from 'fs';
import { normalize, isAbsolute, extname } from 'path';

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff'
};

function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export interface MediaServer {
  port: number;
  close: () => void;
}

export function createMediaServer(): Promise<MediaServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const rawPath = url.searchParams.get('path') || '';
        if (!rawPath) {
          res.writeHead(400);
          res.end('missing path');
          return;
        }
        const normalized = normalize(rawPath);
        if (!isAbsolute(normalized)) {
          res.writeHead(400);
          res.end('invalid path');
          return;
        }

        const stat = await fs.promises.stat(normalized);
        const fileSize = stat.size;
        const contentType = getContentType(normalized);
        const range = req.headers.range;

        res.setHeader('accept-ranges', 'bytes');
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('content-type', contentType);

        if (range) {
          const match = range.match(/bytes=(\d+)-(\d*)/);
          if (!match) {
            res.writeHead(416);
            res.end();
            return;
          }
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkLen = end - start + 1;

          res.writeHead(206, {
            'content-range': `bytes ${start}-${end}/${fileSize}`,
            'content-length': String(chunkLen)
          });

          const stream = fs.createReadStream(normalized, { start, end });
          stream.pipe(res);
          stream.on('error', () => { res.destroy(); });
        } else {
          res.writeHead(200, { 'content-length': String(fileSize) });
          const stream = fs.createReadStream(normalized);
          stream.pipe(res);
          stream.on('error', () => { res.destroy(); });
        }
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, close: () => server.close() });
    });
  });
}
