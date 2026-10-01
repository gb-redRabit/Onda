import { createHash } from 'crypto';
import { createReadStream } from 'fs';

// Oblicza sumę kontrolną SHA-256 pliku, strumieniując go (bez pełnego
// ładowania do pamięci). Odrzuca przy błędach odczytu.
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
