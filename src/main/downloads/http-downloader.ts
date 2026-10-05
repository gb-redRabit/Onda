import fs from 'fs';
import {
  copyFile as fsCopyFile,
  rename as fsRename,
  rm as fsRm,
  stat as fsStat,
  unlink as fsUnlink
} from 'fs/promises';
import http from 'http';
import https from 'https';
import { logger } from '../../shared/logger';
import {
  createPinnedLookup,
  privateNetworkAllowedForTarget,
  resolveNetworkTarget
} from '../ipc/network-target';

const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Górna granica dla pojedynczego pobierania HTTP.
 *
 * Strumień pochodzi ze źródła mediów skonfigurowanego przez użytkownika, więc długość
 * jest taka, jaką poda serwer — a źródło, które nigdy nie przestaje wysyłać, zapełniłoby
 * dysk. Limit jest celowo znacznie powyżej każdego prawdopodobnego pojedynczego pliku,
 * więc uruchamia się tylko przy uszkodzonej lub wrogiej odpowiedzi; `onTooLarge`
 * pozwala wywołującemu to ujawnić.
 */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024 * 1024;

interface HttpDownloadProgress {
  received: number;
  total: number | null;
}

interface HttpDownloadOptions {
  url: string;
  destPath: string;
  headers?: Record<string, string>;
  allowPrivateNetwork?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Nadpisuje MAX_DOWNLOAD_BYTES; suma obejmująca wznowiony prefiks. */
  maxBytes?: number;
  onProgress?: (p: HttpDownloadProgress) => void;
}

/**
 * Czy nieudane pobieranie warto ponowić od miejsca, w którym się zatrzymało.
 *
 * Każde niepowodzenie usuwało wcześniej `.part`, więc połączenie zerwane po
 * 4 GB z pliku 10 GB oznaczało start od zera — a wstrzymane zadanie również nie
 * mogło zostać wznowione, bo wstrzymanie to abort. Teraz plik częściowy przetrwa
 * wszystko, z czego sieć może się podnieść, i jest usuwany tylko wtedy, gdy ponowienie
 * nie pomoże: plik jest zbyt duży, serwer kategorycznie go odrzuca albo URL nie da się
 * śledzić wystarczająco daleko, by wiedzieć, co jest pobierane.
 */
function isTransientDownloadError(err: Error): boolean {
  const http = /^HTTP (\d{3})/.exec(err.message);
  if (http) {
    const status = Number(http[1]);
    // 408 i 429 to serwer proszący nas o powrót później; 5xx to jego zła
    // kondycja. Poza tym 4xx to wyrok na żądanie.
    return status === 408 || status === 429 || status >= 500;
  }
  if (/too many redirects/i.test(err.message)) return false;
  if (/too large/i.test(err.message)) return false;
  // Anulowania, timeouts, resety i odrzucone połączenia to głos sieci.
  return true;
}

async function doDownload(
  opts: HttpDownloadOptions,
  redirectsLeft: number,
  trustedOrigin?: string
): Promise<void> {
  if (opts.signal?.aborted) throw new Error('Aborted');
  const origin = trustedOrigin ?? new URL(opts.url).origin;
  const allowPrivateNetwork = privateNetworkAllowedForTarget(
    opts.url,
    origin,
    opts.allowPrivateNetwork === true
  );
  const target = await resolveNetworkTarget(opts.url, { allowPrivateNetwork });

  // Rozwiązywanie hosta to await, a listener abort nie jest podłączony aż do
  // wnętrza poniższego promise — więc anulowanie, które trafiło podczas DNS lub
  // próby połączenia, wysyłało zdarzenie, którego nikt nie słuchał, a pobieranie
  // trwało dalej. Sprawdzane ponownie tutaj, aby anulowanie w trakcie konfiguracji
  // żądania faktycznie je anulowało.
  if (opts.signal?.aborted) throw new Error('Aborted');

  const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const partPath = `${opts.destPath}.part`;
  let received = 0;
  let total: number | null = null;

  // Obsługa wznowienia: sprawdź istniejący plik .part i wyślij nagłówek Range.
  // Asynchronicznie — synchroniczny `stat` na tej ścieżce blokował pętlę zdarzeń Node
  // (czyli całe IPC).
  let startByte = 0;
  try {
    const partStat = await fsStat(partPath);
    if (partStat.size > 0) {
      startByte = partStat.size;
      received = startByte;
    }
  } catch {
    // brak pliku częściowego — start od zera
  }

  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;

    const cleanup = (): void => {
      // Zwolnienie małego `.part` jest asynchroniczne (bez blokowania main); następna
      // próba i tak otwiera plik przez `createWriteStream` z flagą `w`/`a`.
      void fsRm(partPath, { force: true }).catch((e) => {
        // Nieaktualny plik .part powodowałby, że następna próba wznowiłaby od złych bajtów.
        logger.warn('download', `failed to remove partial file ${partPath}`, e);
      });
    };

    /** Usuwa plik częściowy tylko wtedy, gdy niepowodzenie wyklucza ponowienie. */
    const discardIfHopeless = (err: Error): void => {
      if (isTransientDownloadError(err)) return;
      cleanup();
    };

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Onda/1.0',
      ...(opts.headers || {})
    };
    if (startByte > 0) {
      requestHeaders['Range'] = `bytes=${startByte}-`;
    }

    /**
     * Ustawiane, gdy treść odpowiedzi jest już zapisywana, aby abort lub timeout
     * mógł zamknąć zarówno strumień zapisu, jak i żądanie. Pozostawienie go otwartego
     * wycieka deskryptor pliku przy każdym anulowanym pobieraniu.
     */
    let abortStreams: ((err: Error) => void) | null = null;
    const teardown = (err: Error): void => {
      req.destroy();
      // Gdy treść odpowiedzi jest zapisywana, `fail` zarządza plikiem .part: musi
      // poczekać na zamknięcie strumienia zapisu przed odlinkowaniem. Sprzątanie
      // tutaj również wyścigowałoby się z wciąż oczekującym open() i pozostawiłoby
      // zerowej długości .part dla następnej próby do wznowienia.
      if (abortStreams) {
        abortStreams(err);
        return;
      }
      discardIfHopeless(err);
      reject(err);
    };

    const req = transport.get(
      target.url,
      { headers: requestHeaders, lookup: createPinnedLookup(target.addresses) },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            cleanup();
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, target.url).toString();
          const nextHeaders = new URL(next).origin === target.url.origin ? opts.headers : undefined;
          doDownload({ ...opts, url: next, headers: nextHeaders }, redirectsLeft - 1, origin).then(
            resolve,
            reject
          );
          return;
        }
        // 206 Partial Content — serwer obsługuje wznowienie
        // 200 OK — serwer nie obsługuje wznowienia, restart od zera
        const isResuming = status === 206;
        if (status < 200 || (status >= 300 && status !== 206)) {
          // Sprawdzane przed poniższym resetem wznowienia: 429 lub 503 nigdy nie
          // niesie Range, więc potraktowanie brakującego 206 jako "częściowy jest
          // bezwartościowy" zadziałałoby pierwsze i usunęło plik, zanim status został
          // w ogóle sklasyfikowany.
          res.resume();
          // 4xx to wyrok na żądanie, więc plik częściowy jest zbędnym balastem;
          // 5xx, 408 i 429 to serwer proszący o ponowną próbę, więc zostaje.
          const err = new Error(`HTTP ${status}`);
          discardIfHopeless(err);
          reject(err);
          return;
        }
        if (!isResuming && startByte > 0) {
          // Serwer nie obsługuje Range — trzymany prefiks nie jest prefiksem tej
          // odpowiedzi, więc musi zniknąć. `flags: 'w'` (użyte niżej) obcina plik
          // do zera przy otwarciu, więc NIE wolno tu równolegle usuwać `.part`:
          // asynchroniczny `rm` mógł wykonać się po `open()`, zostawiając strumień
          // piszący do osieroconego i-węzła (rename kończył się ENOENT).
          startByte = 0;
          received = 0;
        }
        const contentLength = res.headers['content-length'];
        if (contentLength) {
          const len = parseInt(contentLength, 10) || 0;
          total = isResuming ? startByte + len : len;
        }
        // Odrzuć zbyt dużą treść na podstawie nagłówka, zanim zapisze się bajt, a
        // potem ponownie podczas strumieniowania dla odpowiedzi bez żadnej długości.
        if (total !== null && total > maxBytes) {
          res.resume();
          cleanup();
          reject(new Error(`Download too large (${total} bytes > ${maxBytes})`));
          return;
        }

        const out = fs.createWriteStream(partPath, { flags: isResuming ? 'a' : 'w' });

        // Każde niepowodzenie przechodzi tędy: odpowiedź i strumień zapisu to
        // osobne deskryptory plików, a porzucenie strumienia zapisu wycieka jeden
        // na każde anulowane pobieranie. `settled` sprawia, że pierwsze niepowodzenie
        // jest wiążące.
        let settled = false;
        const fail = (err: Error): void => {
          if (settled) return;
          settled = true;
          res.unpipe(out);
          res.destroy();
          out.destroy();
          // Gdy .part faktycznie musi zniknąć, znika dopiero po zniknięciu
          // deskryptora. Usunięcie go najpierw przegrywa wyścig z oczekującym open() —
          // plik zostaje utworzony później, a zerowej długości .part pozostaje dla
          // następnej próby do potraktowania jako prawidłowy prefiks wznowienia.
          // Ponawialne niepowodzenie zachowuje plik, więc nic nie jest odlinkowywane.
          if (out.closed) discardIfHopeless(err);
          else out.once('close', () => discardIfHopeless(err));
          reject(err);
        };
        abortStreams = fail;

        res.on('data', (c: Buffer) => {
          received += c.length;
          if (received > maxBytes) {
            fail(new Error(`Download too large (over ${maxBytes} bytes)`));
            return;
          }
          opts.onProgress?.({ received, total });
        });
        res.pipe(out);
        out.on('finish', () => {
          if (settled) return;
          settled = true;
          out.close(() => {
            // Asynchronicznie: `rename`/`copyFile` (fallback cross-device!) do 20 GiB
            // nie mogą blokować pętli zdarzeń main.
            void (async () => {
              try {
                await fsRename(partPath, opts.destPath);
              } catch {
                try {
                  await fsCopyFile(partPath, opts.destPath);
                  await fsUnlink(partPath);
                } catch (copyErr) {
                  // Pobieranie jest kompletne i poprawne; nie udało się tylko
                  // przeniesienie na miejsce. Usunięcie .part wyrzuciłoby cały plik,
                  // więc jest zachowywany — ale tylko jeśli wygląda jak prawdziwe
                  // pobranie, bo zapełniony dysk pozostawiłby w przeciwnym razie obcięty
                  // plik zajmujący resztę wolnego miejsca.
                  let size = 0;
                  try {
                    size = (await fsStat(partPath)).size;
                  } catch {
                    size = 0;
                  }
                  if (size > 0) {
                    logger.warn(
                      'download',
                      `downloaded file could not be moved to ${opts.destPath}; kept at ${partPath}`,
                      copyErr
                    );
                  } else {
                    cleanup();
                  }
                  reject(copyErr as Error);
                  return;
                }
              }
              opts.onProgress?.({ received, total });
              resolve();
            })();
          });
        });
        out.on('error', fail);
        res.on('error', fail);
      }
    );

    const onAbortListener = (): void => teardown(new Error('Aborted'));
    opts.signal?.addEventListener('abort', onAbortListener, { once: true });
    // Sygnał anulowany między powyższym sprawdzeniem a tą linią przegapiłby swoje
    // jedyne zdarzenie, więc listener jest podłączony, zanim cokolwiek jest oczekiwane,
    // a stan jest odczytywany ponownie raz, tutaj.
    if (opts.signal?.aborted) onAbortListener();

    req.setTimeout(opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS, () => teardown(new Error('Timeout')));
    req.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbortListener);
      teardown(err);
    });
  });
}

/**
 * Pobiera URL bezpośrednio do pliku (z `.part` tymczasowo). Błędy rzucane są jako
 * Error z komunikatem klasyfikowalnym przez error-classifier (network/not-found/...).
 */
export async function downloadHttpFile(opts: HttpDownloadOptions): Promise<void> {
  try {
    await doDownload(opts, MAX_REDIRECTS);
  } catch (e) {
    logger.warn('http-download', `download failed for ${opts.url}`, e);
    throw e;
  }
}
