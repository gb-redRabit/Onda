import { Worker } from 'node:worker_threads';

// SHA-256 pliku liczony w wątku roboczym, żeby hashowanie wielogigabajtowego wideo
// nie zajmowało pętli zdarzeń procesu głównego (blokowało IPC/UI). Worker jest tworzony
// z kodu inline (`eval: true`), więc nie wymaga osobnego punktu wejścia w bundlu.
const HASH_WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const hash = createHash('sha256');
const stream = createReadStream(workerData.path);
stream.on('error', (e) => { parentPort.postMessage({ error: e && e.message ? e.message : String(e) }); });
stream.on('data', (chunk) => hash.update(chunk));
stream.on('end', () => parentPort.postMessage({ hash: hash.digest('hex') }));
`;

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(HASH_WORKER_SRC, { eval: true, workerData: { path: filePath } });
    let settled = false;
    worker.on('message', (msg: { hash?: string; error?: string }) => {
      settled = true;
      void worker.terminate();
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.hash as string);
    });
    worker.on('error', (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    });
    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`hash worker exited with code ${code}`));
    });
  });
}
