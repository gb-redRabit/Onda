import { createHash } from 'crypto';
import { createReadStream } from 'fs';

// Computes the SHA-256 checksum of a file by streaming it (no full load into
// memory). Rejects on read errors.
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
