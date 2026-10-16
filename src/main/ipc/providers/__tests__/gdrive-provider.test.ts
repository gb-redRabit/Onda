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

const fetchMock = vi.fn(async (raw: unknown) => {
  const url = String(raw);
  if (url.includes('/drive/folders/')) {
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => FOLDER_HTML };
  }
  return jsonRes({
    'content-disposition': 'attachment; filename="My Video.mp4"',
    'content-range': 'bytes 0-0/1048576'
  });
});

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
