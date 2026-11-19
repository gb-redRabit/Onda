import { inflateRaw } from 'zlib';

// Dekompresja asynchroniczna: `inflateRawSync` blokował pętlę zdarzeń procesu
// głównego na czas rozpakowania całego archiwum (nawet kilku MB), przez co
// okno przestawało odpowiadać na IPC.
function inflateEntry(raw: Buffer, maxOutputLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    inflateRaw(raw, { maxOutputLength }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Minimalny czytnik ZIP (wystarczający dla archiwów AnimeSub: deflate lub stored).
// Bez zależności — centralny katalog daje poprawne rozmiary, więc dane lokalnego
// nagłówka tylko omijamy. Nazwy dekodujemy jako UTF-8 (nazwy odcinków są ASCII).

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
// ZIP bomb: pojedynczy wpis nie może rozpakować się do nieograniczonej pamięci
// w procesie głównym. AnimeSub używa małych napisów, więc 16 MB jest hojnym limitem.
const MAX_ENTRY_OUTPUT_BYTES = 16 * 1024 * 1024;
// ZIP bomb: limit liczby wpisów i łącznego rozmiaru po dekompresji. Bez tego
// archiwum z dziesiątkami tysięcy wpisów po 16 MB wyczerpałoby pamięć main.
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_OUTPUT_BYTES = 512 * 1024 * 1024;

function findEndOfCentralDirectory(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

export async function readZip(buf: Buffer): Promise<ZipEntry[]> {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let totalOutput = 0;

  for (let i = 0; i < count && i < MAX_ENTRIES && off + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(off) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf-8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // katalog
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) continue;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    try {
      if (method === 0 && raw.length > MAX_ENTRY_OUTPUT_BYTES) continue;
      const data =
        method === 0 ? Buffer.from(raw) : await inflateEntry(raw, MAX_ENTRY_OUTPUT_BYTES);
      totalOutput += data.length;
      if (totalOutput > MAX_TOTAL_OUTPUT_BYTES) break;
      entries.push({ name, data });
    } catch {
      /* pomiń wpis, którego nie da się rozpakować */
    }
  }
  return entries;
}
