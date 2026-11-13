import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna providera Google Drive: pliki (Content-Disposition) oraz
// foldery (scrape `window['_DRIVE_ivd']`). `fetch` mockowany.

const cookieRef = { value: '' };
vi.mock('../provider-credentials', () => ({
  getProviderCookie: vi.fn(async () => cookieRef.value)
}));

import { gdriveProvider } from '../gdrive';

function jsonRes(headers: Record<string, string>) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body: { cancel: async () => {} },
    text: async () => ''
  };
}

const ROWS = [
  ['id', 'name', 'mimeType', 'size'],
  ['f1', 'movie.mp4', 'video/mp4', '12345'],
  ['d1', 'sub', 'application/vnd.google-apps.folder', '']
];
const FOLDER_HTML = `<script>window['_DRIVE_ivd'] = '${JSON.stringify(ROWS).replace(/"/g, '\\"')}';</script>`;

interface FakeFetchResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  body?: { cancel: () => Promise<void> };
  text: () => Promise<string>;
}

const fetchMock = vi.fn(
  async (
    _raw: unknown,
    _init?: { headers?: Record<string, string> }
  ): Promise<FakeFetchResponse> => {
    const url = String(_raw);
    if (url.includes('/drive/folders/')) {
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => FOLDER_HTML };
    }
    return jsonRes({
      'content-disposition': 'attachment; filename="My Video.mp4"',
      'content-range': 'bytes 0-0/1048576'
    });
  }
);

function mockFolderPayload(payload: string): void {
  fetchMock.mockImplementationOnce(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => `<script>window['_DRIVE_ivd'] = '${payload}';</script>`
  }));
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

beforeEach(() => {
  cookieRef.value = '';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const FILE_REF = { provider: 'gdrive', shareId: 'ABC123' };

describe('match/parse', () => {
  it('matches drive links and extracts the file id', () => {
    expect(gdriveProvider.match('https://drive.google.com/file/d/ABC123/view')).toBe(true);
    expect(gdriveProvider.parse('https://drive.google.com/file/d/ABC123/view')).toEqual(FILE_REF);
  });

  it('marks folder links', () => {
    expect(gdriveProvider.parse('https://drive.google.com/drive/folders/FLD')).toEqual({
      provider: 'gdrive',
      shareId: 'folder:FLD'
    });
  });

  it('supports the /d/ and ?id= forms', () => {
    expect(gdriveProvider.parse('https://drive.google.com/d/XYZ/view')?.shareId).toBe('XYZ');
    expect(gdriveProvider.parse('https://drive.google.com/open?id=XYZ')?.shareId).toBe('XYZ');
  });

  it('returns null when the link has no file id', () => {
    expect(gdriveProvider.parse('https://drive.google.com/about')).toBeNull();
  });
});

describe('listFolder — file metadata edge cases', () => {
  it('falls back to the generated name when the probe request fails', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });

    const items = await gdriveProvider.listFolder(FILE_REF);

    expect(items[0]).toMatchObject({ id: 'ABC123', name: 'Drive-ABC123', kind: 'file' });
    expect(items[0]?.size).toBeUndefined();
  });

  it('decodes RFC 5987 filenames, uses content-length and cancels the body', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('already closed');
    });
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          ({
            'content-disposition': "attachment; filename*=UTF-8''My%20Video.mp4",
            'content-length': '2048'
          })[name.toLowerCase()] ?? null
      },
      body: { cancel },
      text: async () => ''
    }));

    const items = await gdriveProvider.listFolder(FILE_REF);

    expect(items[0]).toMatchObject({ name: 'My Video.mp4', size: 2048 });
    expect(cancel).toHaveBeenCalled();
  });

  it('falls back to the id when filename and size headers are absent', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { cancel: async () => {} },
      text: async () => ''
    }));

    const items = await gdriveProvider.listFolder(FILE_REF);

    expect(items[0]).toMatchObject({ name: 'Drive-ABC123' });
    expect(items[0]?.size).toBeUndefined();
  });

  it('forwards the cookie to the probe request', async () => {
    cookieRef.value = 'SID=1';

    await gdriveProvider.listFolder(FILE_REF);

    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Cookie).toBe('SID=1');
  });
});

describe('listFolder — file', () => {
  it('resolves a file name/size from Content-Disposition', async () => {
    const items = await gdriveProvider.listFolder(FILE_REF);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'ABC123',
      name: 'My Video.mp4',
      size: 1048576,
      kind: 'file'
    });
    expect(items[0].thumbnail).toContain('drive.google.com/thumbnail');
  });
});

describe('listFolder — folder (scrape)', () => {
  it('parses _DRIVE_ivd into files and subfolders', async () => {
    const items = await gdriveProvider.listFolder({ provider: 'gdrive', shareId: 'folder:ROOT' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'f1', name: 'movie.mp4', kind: 'file', size: 12345 });
    expect(items[1]).toMatchObject({ id: 'd1', name: 'sub', kind: 'folder' });
  });

  it('throws a clear error when the marker is missing', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '<html>no marker</html>'
    }));
    await expect(
      gdriveProvider.listFolder({ provider: 'gdrive', shareId: 'folder:ROOT' })
    ).rejects.toThrow(/folder/i);
  });
});

describe('listFolder — folder scrape edge cases', () => {
  const FOLDER_REF = { provider: 'gdrive', shareId: 'folder:ROOT' };

  it('rejects an HTTP error from the folder page', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => ''
    }));

    await expect(gdriveProvider.listFolder(FOLDER_REF)).rejects.toThrow('HTTP 500');
  });

  it('forwards the cookie to the folder request', async () => {
    cookieRef.value = 'SID=1';

    await gdriveProvider.listFolder(FOLDER_REF);

    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Cookie).toBe('SID=1');
  });

  it('returns no items for invalid or non-array payloads', async () => {
    mockFolderPayload('not json');
    expect(await gdriveProvider.listFolder(FOLDER_REF)).toEqual([]);

    mockFolderPayload('{"a":1}');
    expect(await gdriveProvider.listFolder(FOLDER_REF)).toEqual([]);

    mockFolderPayload('["only-string"]');
    expect(await gdriveProvider.listFolder(FOLDER_REF)).toEqual([]);
  });

  it('parses object payloads and skips entries without a string id', async () => {
    mockFolderPayload(
      escapeJson([
        { id: 42, name: 'bad' },
        { id: '', name: 'empty' },
        { id: 'o1' },
        { id: 'd2', name: 'dir', mimeType: 'application/vnd.google-apps.folder', size: '9' }
      ])
    );

    const items = await gdriveProvider.listFolder(FOLDER_REF);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'o1', name: 'o1', kind: 'file' });
    expect(items[0]?.size).toBeUndefined();
    expect(items[1]).toMatchObject({ id: 'd2', name: 'dir', kind: 'folder' });
    expect(items[1]?.thumbnail).toBeUndefined();
  });

  it('skips non-array rows in header payloads', async () => {
    mockFolderPayload(
      escapeJson([['id', 'name', 'mimeType', 'size'], 'skip', ['f2', 'x.mp4', 'video/mp4', '5']])
    );

    const items = await gdriveProvider.listFolder(FOLDER_REF);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'f2', size: 5 });
  });

  it('parses positional rows without a header', async () => {
    mockFolderPayload(escapeJson([['p1', 'pos.mp4', 'video/mp4', '42'], 'skip']));

    const items = await gdriveProvider.listFolder(FOLDER_REF);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'p1', name: 'pos.mp4', size: 42 });
  });

  it('decodes hex escapes in the payload', async () => {
    mockFolderPayload('[{"id":"\\x66\\x31","name":"escaped"}]');

    const items = await gdriveProvider.listFolder(FOLDER_REF);

    expect(items[0]).toMatchObject({ id: 'f1', name: 'escaped' });
  });
});

describe('resolveFileUrl', () => {
  it('returns the direct download url for the item id', async () => {
    const out = await gdriveProvider.resolveFileUrl(FILE_REF, 'F1');
    expect(out.url).toContain('drive.usercontent.google.com/download');
    expect(out.url).toContain('id=F1');
  });

  it('attaches the Google session cookie for private files', async () => {
    cookieRef.value = 'SID=abc; HSID=def';
    const out = await gdriveProvider.resolveFileUrl(FILE_REF, 'F1');
    expect(out.headers?.Cookie).toBe('SID=abc; HSID=def');
  });
});
