import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Transport jest w całości podstawiony: interesuje nas polityka handlerów
// (walidacja MBID, śledzenie przekierowań okładki, limity rozmiaru), nie sieć.
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  get: null as null | ((url: string, options: unknown, callback: (res: unknown) => void) => unknown)
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9' },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      state.handlers.set(channel, handler);
    }
  }
}));
vi.mock('../../shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));
vi.mock('https', () => ({
  default: {
    get: (url: string, options: unknown, callback: (res: unknown) => void) =>
      state.get!(url, options, callback)
  }
}));
vi.mock('http', () => ({
  default: {
    get: (url: string, options: unknown, callback: (res: unknown) => void) =>
      state.get!(url, options, callback)
  }
}));

const { registerMusicBrainzHandlers } = await import('../musicbrainz');
registerMusicBrainzHandlers();

const VALID_ID = 'b1a9c0de-1234-4abc-8def-0123456789ab';

interface FakeResponseInit {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

function fakeResponse(init: FakeResponseInit): EventEmitter & Record<string, unknown> {
  const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
  res.statusCode = init.statusCode ?? 200;
  res.headers = init.headers ?? {};
  res.resume = vi.fn();
  res.destroy = vi.fn();
  process.nextTick(() => {
    if (init.body !== undefined && init.body !== '') res.emit('data', init.body);
    res.emit('end');
  });
  return res;
}

function mockTransport(sequence: FakeResponseInit[]): string[] {
  const calls: string[] = [];
  state.get = (url, _options, callback) => {
    calls.push(url);
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    req.destroy = vi.fn();
    req.setTimeout = vi.fn();
    const next = sequence.shift() ?? {};
    process.nextTick(() => callback(fakeResponse(next)));
    return req;
  };
  return calls;
}

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const found = state.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

let clock = 1_000_000;

beforeEach(() => {
  // MusicBrainz jest dławiony do 1 req/s; przesuwamy zegar monotonicznie o 10 s
  // na odczyt, żeby testy nie spały. Nie resetujemy go między testami, bo
  // `lastMbRequest` w module pamięta poprzednie wywołanie i cofnięty zegar
  // kazałby czekać kilkanaście sekund.
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10_000));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('musicbrainz search/lookup handlers', () => {
  it('encodes the query and returns releases', async () => {
    const calls = mockTransport([{ body: JSON.stringify({ releases: [{ id: 'r1' }] }) }]);
    const result = (await handler('musicbrainz:searchRelease')(null, 'Daft Punk')) as {
      success: boolean;
      releases: unknown[];
    };
    expect(result).toEqual({ success: true, releases: [{ id: 'r1' }] });
    expect(calls[0]).toContain('query=Daft%20Punk');
  });

  it('treats a non-JSON search response as no releases', async () => {
    mockTransport([{ body: '<html>maintenance</html>' }]);
    const result = (await handler('musicbrainz:searchRelease')(null, 'x')) as {
      success: boolean;
      releases: unknown[];
    };
    expect(result).toEqual({ success: true, releases: [] });
  });

  it('rejects an invalid release id before any request', async () => {
    const calls = mockTransport([]);
    const result = (await handler('musicbrainz:lookupRelease')(null, '../etc/passwd')) as {
      success: boolean;
      error: string;
    };
    expect(result).toEqual({ success: false, error: 'Invalid release id' });
    expect(calls).toHaveLength(0);
  });

  it('looks up a valid release id and returns the payload', async () => {
    const calls = mockTransport([{ body: JSON.stringify({ id: VALID_ID, title: 'Discovery' }) }]);
    const result = (await handler('musicbrainz:lookupRelease')(null, VALID_ID)) as {
      success: boolean;
      release: { title: string };
    };
    expect(result.success).toBe(true);
    expect(result.release.title).toBe('Discovery');
    expect(calls[0]).toContain(`/release/${VALID_ID}`);
  });

  it('rejects a non-JSON lookup body', async () => {
    mockTransport([{ body: 'oops' }]);
    const result = (await handler('musicbrainz:lookupRelease')(null, VALID_ID)) as {
      success: boolean;
      error: string;
    };
    expect(result).toEqual({ success: false, error: 'Invalid response' });
  });

  it('rejects an oversized response without buffering it forever', async () => {
    mockTransport([{ body: 'x'.repeat(2 * 1024 * 1024 + 1) }]);
    const result = (await handler('musicbrainz:searchRelease')(null, 'x')) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Response too large');
  });

  it('retries a 503 with Retry-After and then succeeds', async () => {
    const calls = mockTransport([
      { statusCode: 503, headers: { 'retry-after': '0.01' } },
      { body: JSON.stringify({ releases: [{ id: 'r1' }] }) }
    ]);
    const result = (await handler('musicbrainz:searchRelease')(null, 'x')) as {
      success: boolean;
      releases: unknown[];
    };
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('stops after the retry budget when 503 persists', async () => {
    const calls = mockTransport([
      { statusCode: 503, headers: { 'retry-after': '0.01' } },
      { statusCode: 503, headers: { 'retry-after': '0.01' } },
      { statusCode: 503, headers: { 'retry-after': '0.01' } },
      { statusCode: 503, headers: { 'retry-after': '0.01' } }
    ]);
    const result = (await handler('musicbrainz:searchRelease')(null, 'x')) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limited HTTP 503');
    expect(calls).toHaveLength(4);
  });
});

describe('musicbrainz cover handler', () => {
  it('rejects an invalid release id before any request', async () => {
    const calls = mockTransport([]);
    const result = (await handler('musicbrainz:getCoverData')(null, 'not-a-uuid')) as {
      success: boolean;
    };
    expect(result).toEqual({ success: false, error: 'Invalid release id' });
    expect(calls).toHaveLength(0);
  });

  it('follows an allowed redirect and returns the image bytes', async () => {
    const calls = mockTransport([
      { statusCode: 302, headers: { location: 'https://archive.org/cover.jpg' } },
      { body: Buffer.from([1, 2, 3]) }
    ]);
    const result = (await handler('musicbrainz:getCoverData')(null, VALID_ID)) as {
      success: boolean;
      data: number[];
      mime: string;
    };
    expect(result).toEqual({ success: true, data: [1, 2, 3], mime: 'image/jpeg' });
    expect(calls[0]).toContain(`/release/${VALID_ID}/front`);
    expect(calls[1]).toBe('https://archive.org/cover.jpg');
  });

  it('refuses a redirect to a non-allowed host (SSRF)', async () => {
    const calls = mockTransport([
      { statusCode: 302, headers: { location: 'http://127.0.0.1:8080/secret' } }
    ]);
    const result = (await handler('musicbrainz:getCoverData')(null, VALID_ID)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('non-allowed host');
    expect(calls).toHaveLength(1);
  });

  it('reports a missing cover as an error', async () => {
    mockTransport([{ statusCode: 404, body: 'not found' }]);
    const result = (await handler('musicbrainz:getCoverData')(null, VALID_ID)) as {
      success: boolean;
      error: string;
      rateLimited: boolean;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 404');
    expect(result.rateLimited).toBe(false);
  });

  it('marks 503 as rate limited', async () => {
    mockTransport([{ statusCode: 503, body: 'slow down' }]);
    const result = (await handler('musicbrainz:getCoverData')(null, VALID_ID)) as {
      success: boolean;
      rateLimited: boolean;
    };
    expect(result.success).toBe(false);
    expect(result.rateLimited).toBe(true);
  });
});

describe('musicbrainz autodetect scoring', () => {
  const run = async (releases: { score?: number | string }[]) => {
    mockTransport([{ body: JSON.stringify({ releases }) }]);
    return (await handler('musicbrainz:autodetect')(null, 'query')) as {
      success: boolean;
      match: string;
      releases: unknown[];
    };
  };

  it('returns none for an empty result set', async () => {
    expect(await run([])).toEqual({ success: true, match: 'none', releases: [] });
  });

  it('is certain for a single result', async () => {
    expect((await run([{ score: 40 }])).match).toBe('certain');
  });

  it('is certain for a high score with a clear gap', async () => {
    expect((await run([{ score: 95 }, { score: 70 }])).match).toBe('certain');
  });

  it('is ambiguous for close scores', async () => {
    expect((await run([{ score: 80 }, { score: 79 }])).match).toBe('ambiguous');
  });

  it('is ambiguous when the best score is below the threshold', async () => {
    expect((await run([{ score: 60 }, { score: 10 }])).match).toBe('ambiguous');
  });
});
