import { createHash, randomBytes } from 'node:crypto';
import { throttleProvider } from '../provider-rate-limit';

// Klient anonimowego API udostępnień PikPak (port zweryfikowanego spike'a
// `scripts/pikpak-spike.mjs` do TS w procesie głównym). Bez logowania, bez zależności
// zewnętrznych — tylko wbudowany `fetch`/`crypto`. Podpisane URL-e wygasają, więc
// `web_content_link` rozwiązujemy ŚWIEŻO przy każdej próbie (patrz download-attempt).

const CLIENT_ID = 'YUMx5nI8ZU8Ap8pm';
const CLIENT_VERSION = '2.0.0';
const PACKAGE_NAME = 'mypikpak.com';
const ALGORITHMS = [
  'C9qPpZLN8ucRTaTiUMWYS9cQvWOE',
  '+r6CQVxjzJV6LCV',
  'F',
  'pFJRC',
  '9WXYIDGrwTCz2OiVlgZa90qpECPD6olt',
  '/750aCr4lm/Sly/c',
  'RB+DT/gZCrbV',
  '',
  'CyLsf7hdkIRxRm215hl',
  '7xHvLi2tOYP0Y92b',
  'ZGTXXxu8E/MIWaEDB+Sm/',
  '1UI3',
  'E7fP5Pfijd+7K+t6Tg/NhuLq0eEUVChpJSkrKxpO',
  'ihtqpG6FMt65+Xk+tWUH2',
  'NhXXU9rg4XXdzo7u5o'
];
export const PIKPAK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
// Hosty zgrupowane parami (API + captcha); przy błędzie sieci przechodzimy na kolejną parę.
const HOSTS = [
  { api: 'api-drive.mypikpak.com', user: 'user.mypikpak.com' },
  { api: 'api-drive.mypikpak.net', user: 'user.mypikpak.net' }
];
const REQUEST_TIMEOUT_MS = 30_000;

export class PikPakError extends Error {
  readonly status?: number;
  readonly code?: number;
  // True dla błędów transportu/captcha, które warto ponowić na innym hoście.
  // False dla błędów biznesowych API (error_code / share_status) — ponawianie nie pomaga.
  readonly retryable: boolean;
  constructor(message: string, opts: { status?: number; code?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'PikPakError';
    this.status = opts.status;
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
  }
}

export interface PikPakFileEntry {
  id?: string;
  name?: string;
  kind?: string;
  size?: string;
  thumbnail_link?: string;
  web_thumbnail_link?: string;
}

interface JsonResponse {
  status: number;
  ok: boolean;
  text: string;
  data: Record<string, unknown> | null;
}

function md5(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex');
}

function captchaSign(deviceId: string, ts: string): string {
  let s = CLIENT_ID + CLIENT_VERSION + PACKAGE_NAME + deviceId + ts;
  for (const algo of ALGORITHMS) s = md5(s + algo);
  return '1.' + s;
}

function buildQuery(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');
}

export class PikPakClient {
  private readonly deviceId: string;
  private captchaToken = '';
  private cookie = '';
  private accessToken = '';
  private hostIndex: number;

  constructor(hostIndex = 0) {
    this.deviceId = randomBytes(16).toString('hex');
    this.hostIndex = hostIndex;
  }

  /** Cookie sesji zalogowanego konta (opcjonalnie) — dla pełnych plików/limity. */
  setCookie(cookie: string): void {
    this.cookie = typeof cookie === 'string' ? cookie : '';
  }

  /** Access token (Bearer) z logowania — PikPak trzyma go w localStorage, nie w cookies. */
  setAccessToken(token: string): void {
    this.accessToken = typeof token === 'string' ? token : '';
  }

  hasAccessToken(): boolean {
    return !!this.accessToken;
  }

  // Odświeżenie access_token przez refresh_token (PikPak; endpoint na hoście `user`).
  // Best-effort: jeśli serwis odrzuci (np. wymaga client_secret), rzuca — wołający ignoruje.
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const url = `https://${HOSTS[this.hostIndex].user}/v1/auth/token`;
    const r = await this.httpJson(
      url,
      'POST',
      JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    );
    const token = (r.data?.access_token as string | undefined) || '';
    if (!token) throw new PikPakError('refresh: brak access_token', { status: r.status });
    return token;
  }

  private headers(): Record<string, string> {
    return {
      'User-Agent': PIKPAK_UA,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Client-ID': CLIENT_ID,
      'X-Device-ID': this.deviceId,
      'X-Captcha-Token': this.captchaToken || '',
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {})
    };
  }

  private async httpJson(
    url: string,
    method: 'GET' | 'POST',
    body?: string
  ): Promise<JsonResponse> {
    await throttleProvider('pikpak');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body,
        signal: controller.signal
      });
      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        data = null;
      }
      return { status: res.status, ok: res.ok, text, data };
    } finally {
      clearTimeout(timer);
    }
  }

  private async refreshCaptcha(action: string): Promise<void> {
    const ts = String(Date.now());
    const body = {
      action,
      captcha_token: this.captchaToken || '',
      client_id: CLIENT_ID,
      device_id: this.deviceId,
      meta: {
        captcha_sign: captchaSign(this.deviceId, ts),
        client_version: CLIENT_VERSION,
        package_name: PACKAGE_NAME,
        timestamp: ts,
        user_id: ''
      },
      redirect_uri: 'xlaccsdk01://xbase.cloud/callback?state=harbor'
    };
    const r = await this.httpJson(
      `https://${HOSTS[this.hostIndex].user}/v1/shield/captcha/init?client_id=${CLIENT_ID}`,
      'POST',
      JSON.stringify(body)
    );
    const token = r.data?.captcha_token;
    if (!r.ok || typeof token !== 'string' || !token) {
      const desc = (r.data?.error_description as string) || r.text.slice(0, 200);
      throw new PikPakError(`captcha/init ${r.status}: ${desc}`, {
        status: r.status,
        retryable: true
      });
    }
    this.captchaToken = token;
  }

  // GET na API z automatycznym captcha i jednym ponowieniem po error_code 9 (captcha wygasła).
  private async request(
    pathname: string,
    query: Record<string, string | undefined>
  ): Promise<Record<string, unknown>> {
    const url = `https://${HOSTS[this.hostIndex].api}${pathname}?${buildQuery(query)}`;
    const action = `GET:${pathname}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!this.captchaToken) await this.refreshCaptcha(action);
      const r = await this.httpJson(url, 'GET');
      const code = r.data?.error_code as number | undefined;
      if (attempt < 3 && code === 9) {
        this.captchaToken = '';
        continue;
      }
      if (!r.data)
        throw new PikPakError(`Brak JSON (${r.status})`, { status: r.status, retryable: true });
      if (code) {
        const desc = (r.data.error_description as string) || (r.data.error as string) || '';
        throw new PikPakError(`API ${code}: ${desc}`, { code });
      }
      return r.data;
    }
    throw new PikPakError('Nie udało się wykonać żądania (captcha).', { retryable: true });
  }

  // POST na API z tym samym captcha/retry co `request`.
  private async requestPost(
    pathname: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `https://${HOSTS[this.hostIndex].api}${pathname}`;
    const action = `POST:${pathname}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!this.captchaToken) await this.refreshCaptcha(action);
      const r = await this.httpJson(url, 'POST', JSON.stringify(body));
      const code = r.data?.error_code as number | undefined;
      if (attempt < 3 && code === 9) {
        this.captchaToken = '';
        continue;
      }
      if (!r.data)
        throw new PikPakError(`Brak JSON (${r.status})`, { status: r.status, retryable: true });
      if (code) {
        const desc = (r.data.error_description as string) || (r.data.error as string) || '';
        throw new PikPakError(`API ${code}: ${desc}`, { code });
      }
      return r.data;
    }
    throw new PikPakError('Nie udało się wykonać żądania (captcha).', { retryable: true });
  }

  // „转存": zapisuje plik z udostępnienia na dysk użytkownika (wymaga logowania) i zwraca
  // id pliku NA DYSKU. Uwaga: pole `file_id` w odpowiedzi restore to placeholder — faktyczny
  // plik znajdziemy w zdarzeniach (`/drive/v1/events`, `TYPE_RESTORE`) po nazwie.
  // Dzięki temu oryginał (np. 4K) bywa dostępny, gdy sam share jest ograniczony quota.
  // Kopię trzeba potem usunąć (patrz cleanupDriveFiles).
  async restoreToDrive(shareId: string, fileId: string, fileName = ''): Promise<string> {
    await this.withHostFallback(() =>
      this.requestPost('/drive/v1/share/restore', {
        share_id: shareId,
        pass_code_token: '',
        file_ids: [fileId],
        to_parent_id: ''
      })
    );
    const deadline = Date.now() + 60000;
    for (;;) {
      try {
        const ev = await this.withHostFallback(() =>
          this.request('/drive/v1/events', { thumbnail_size: 'SIZE_MEDIUM', limit: '20' })
        );
        const events =
          (ev.events as Array<{ type?: string; file_id?: string; file_name?: string }>) || [];
        const match = events.find(
          (e) => e.type === 'TYPE_RESTORE' && e.file_id && (!fileName || e.file_name === fileName)
        );
        if (match?.file_id) return match.file_id;
      } catch {
        // zdarzenia chwilowo niedostępne — ponów
      }
      if (Date.now() > deadline) throw new PikPakError('restore: nie znaleziono pliku w events');
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // Metadane pliku z udostępnienia (nazwa + ewentualny bezpośredni URL) — jedno źródło prawdy.
  async getShareFileMeta(shareId: string, fileId: string): Promise<{ name: string; url?: string }> {
    const resp = await this.withHostFallback(() =>
      this.request('/drive/v1/share/file_info', {
        share_id: shareId,
        file_id: fileId,
        pass_code_token: ''
      })
    );
    const info = (resp.file_info as Record<string, unknown>) || resp;
    return { name: String(info.name || ''), url: PikPakClient.directUrl({ file_info: info }) };
  }

  // Bezpośredni URL pliku z WŁASNEGO dysku (oryginał). `usage=FETCH` daje link downloadu.
  async getDriveFileUrl(fileId: string): Promise<string | undefined> {
    const resp = await this.withHostFallback(() =>
      this.request(`/drive/v1/files/${fileId}`, {
        usage: 'FETCH',
        thumbnail_size: 'SIZE_LARGE',
        _magic: '2021'
      })
    );
    return PikPakClient.directUrl(resp);
  }

  // Czeka aż odtworzony plik będzie gotowy (rozmiar > 0) i zwraca jego URL.
  async waitDriveFileUrl(fileId: string, timeoutMs = 300000): Promise<string | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const resp = await this.withHostFallback(() =>
          this.request(`/drive/v1/files/${fileId}`, {
            usage: 'FETCH',
            thumbnail_size: 'SIZE_LARGE',
            _magic: '2021'
          })
        );
        if (Number(resp.size) > 0) {
          const url = PikPakClient.directUrl(resp);
          if (url) return url;
        }
      } catch {
        // plik jeszcze nie gotowy / chwilowy błąd — ponów
      }
      if (Date.now() > deadline) return undefined;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // Usuwa pliki z dysku: najpierw do kosza, potem TRWALE (kosz liczy się do limitu miejsca).
  async cleanupDriveFiles(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.withHostFallback(() => this.requestPost('/drive/v1/files:batchTrash', { ids }));
    try {
      await this.withHostFallback(() => this.requestPost('/drive/v1/files:batchDelete', { ids }));
    } catch {
      // plik został w koszu — gorsze, ale nie wywala pobierania
    }
  }

  // Przechodzi na kolejny host tylko przy błędzie transportu/captcha. Błędy biznesowe
  // API (error_code / share_status) są propagowane od razu — ponawianie nie pomaga.
  private async withHostFallback<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < HOSTS.length; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        const canRetry = !(e instanceof PikPakError) || e.retryable;
        if (!canRetry || i >= HOSTS.length - 1) break;
        this.hostIndex = (this.hostIndex + 1) % HOSTS.length;
      }
    }
    throw lastError instanceof Error ? lastError : new PikPakError(String(lastError));
  }

  async listFolder(shareId: string, parentId = ''): Promise<PikPakFileEntry[]> {
    return this.withHostFallback(async () => {
      const out: PikPakFileEntry[] = [];
      let pageToken = '';
      const seen = new Set<string>();
      for (;;) {
        const resp = await this.request('/drive/v1/share/detail', {
          share_id: shareId,
          parent_id: parentId,
          pass_code_token: '',
          thumbnail_size: 'SIZE_LARGE',
          with_audit: 'true',
          limit: '100',
          page_token: pageToken,
          filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}'
        });
        const status = resp.share_status as string | undefined;
        if (status && status !== 'OK') {
          const text = (resp.share_status_text as string) || '';
          throw new PikPakError(`share_status=${status}${text ? ` (${text})` : ''}`);
        }
        for (const f of (resp.files as PikPakFileEntry[]) || []) out.push(f);
        const next = (resp.next_page_token as string) || '';
        if (!next || seen.has(next)) break;
        seen.add(next);
        pageToken = next;
      }
      return out;
    });
  }

  private static directUrl(resp: Record<string, unknown>): string | undefined {
    const info = (resp.file_info as Record<string, unknown>) || resp;
    const direct = info.web_content_link as string | undefined;
    if (direct) return direct;
    // PikPak zwraca kilka renditions; część (Original/1080P) może nie mieć linku, gdy
    // konto nie ma dość quota/wymaga VIP (`need_more_quota`). Bierzemy PIERWSZĄ, która
    // MA link — to kompletny plik w dostępnej jakości (zamiast renderu bez linku).
    const medias = info.medias as Array<{ link?: { url?: string } }> | undefined;
    return medias?.find((m) => m?.link?.url)?.link?.url;
  }

  async getFileInfo(shareId: string, fileId: string): Promise<string> {
    return this.withHostFallback(async () => {
      const query = { share_id: shareId, file_id: fileId, pass_code_token: '' };
      const resp = await this.request('/drive/v1/share/file_info', query);
      const direct = PikPakClient.directUrl(resp);
      if (direct) return direct;
      // Zalogowany request (Bearer) bywa, że nie zwraca linku (np. token wygasł) — wtedy
      // ponawiamy ANONIMOWO, żeby pobranie w ogóle dostało URL zamiast twardego błędu.
      if (this.accessToken) {
        const saved = this.accessToken;
        this.accessToken = '';
        try {
          const anon = await this.request('/drive/v1/share/file_info', query);
          const anonDirect = PikPakClient.directUrl(anon);
          if (anonDirect) return anonDirect;
        } finally {
          this.accessToken = saved;
        }
      }
      throw new PikPakError('Brak bezpośredniego URL dla pliku');
    });
  }
}
