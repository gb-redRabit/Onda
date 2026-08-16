import { describe, expect, it } from 'vitest';
import { sanitizeSource, sanitizeEndpoint } from '../sources-store';

const BASE = {
  id: 's1',
  name: 'Test',
  baseUrl: 'https://api.example.com',
  auth: { type: 'none' },
  endpoints: [
    { id: 'e1', name: 'Lista', method: 'GET', path: '/items', mapping: { fields: {} } }
  ]
};

describe('sanitizeSource — download prefs', () => {
  it('passes outputDir and folder through', () => {
    const src = sanitizeSource({ ...BASE, download: { outputDir: 'C:\\Media\\api', folder: false } });
    expect(src?.download).toEqual({ outputDir: 'C:\\Media\\api', folder: false });
  });

  it('defaults folder to true when omitted (undefined = folder mode)', () => {
    const src = sanitizeSource({ ...BASE, download: { outputDir: 'D:\\api' } });
    expect(src?.download).toEqual({ outputDir: 'D:\\api' });
  });

  it('drops invalid outputDir, keeps boolean folder', () => {
    const src = sanitizeSource({ ...BASE, download: { outputDir: '   ', folder: false } });
    expect(src?.download).toEqual({ folder: false });
  });

  it('is undefined when download is missing or fully empty', () => {
    expect(sanitizeSource(BASE)?.download).toBeUndefined();
    expect(sanitizeSource({ ...BASE, download: {} })?.download).toBeUndefined();
    expect(sanitizeSource({ ...BASE, download: null })?.download).toBeUndefined();
  });

  it('keeps download prefs when only folder flag is set', () => {
    const src = sanitizeSource({ ...BASE, download: { outputDir: '', folder: true } });
    expect(src?.download).toEqual({ folder: true });
  });

  it('keeps download prefs alongside valid endpoints', () => {
    const src = sanitizeSource({
      ...BASE,
      download: { outputDir: '/media/api' },
      endpoints: [
        { id: 'e1', name: 'Lista', path: '/items', mapping: { fields: { title: 'name' } } }
      ]
    });
    expect(src?.download?.outputDir).toBe('/media/api');
    expect(src?.endpoints[0].mapping.fields.title).toBe('name');
    expect(sanitizeEndpoint({ path: '/x', mapping: { fields: {} } }, 0)).not.toBeNull();
  });
});

describe('sanitizeSource — icon', () => {
  it('keeps a data URL icon', () => {
    const src = sanitizeSource({ ...BASE, icon: 'data:image/png;base64,AAAA' });
    expect(src?.icon).toBe('data:image/png;base64,AAAA');
  });

  it('keeps an http(s) icon URL', () => {
    const src = sanitizeSource({ ...BASE, icon: 'https://cdn.example.com/icon.png' });
    expect(src?.icon).toBe('https://cdn.example.com/icon.png');
  });

  it('drops non-image data URLs', () => {
    expect(sanitizeSource({ ...BASE, icon: 'data:text/html;base64,AAAA' })?.icon).toBeUndefined();
  });

  it('drops non-http URLs and junk', () => {
    expect(sanitizeSource({ ...BASE, icon: 'ftp://x/icon.png' })?.icon).toBeUndefined();
    expect(sanitizeSource({ ...BASE, icon: 'not-a-url' })?.icon).toBeUndefined();
  });

  it('drops oversized data URLs', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(200_001);
    expect(sanitizeSource({ ...BASE, icon: big })?.icon).toBeUndefined();
  });
});

describe('sanitizeEndpoint — playerUrl fields', () => {
  it('keeps playerUrl in mapping fields and table', () => {
    const ep = sanitizeEndpoint(
      {
        path: '/items',
        mapping: { fields: { mediaUrl: 'url', playerUrl: 'embed' } },
        table: { mode: 'endpoint', rowKey: 'n', title: 'EP {n}', thumbnail: 'bg', playerUrl: 'embed_url' }
      },
      0
    );
    expect(ep?.mapping.fields).toMatchObject({ mediaUrl: 'url', playerUrl: 'embed' });
    expect(ep?.table?.playerUrl).toBe('embed_url');
  });

  it('drops playerUrl when not a string', () => {
    const ep = sanitizeEndpoint(
      { path: '/items', mapping: { fields: { playerUrl: 42 as never } } },
      0
    );
    expect(ep?.mapping.fields.playerUrl).toBeUndefined();
  });
});
