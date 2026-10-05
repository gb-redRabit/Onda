import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * SHA-256 pliku, strumieniowo, aby dużego wideo nie trzeba było buforować.
 *
 * `maxBytes` ogranicza odczyt — hash'owanie wielogigabajtowego pliku to minuty
 * wysycania dysku, więc wywołujący może ograniczyć, na co chce patrzeć. Zwraca `null`,
 * gdy plik przekracza budżet. Wspólna implementacja dla detekcji duplikatów (fs) i
 * sum kontrolnych pobrań.
 */
export function hashFile(filePath: string, maxBytes?: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let seen = 0;
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => {
      seen += chunk.length;
      if (maxBytes !== undefined && seen > maxBytes) {
        stream.destroy();
        resolve(null);
      } else {
        hash.update(chunk);
      }
    });
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
