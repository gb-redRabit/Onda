import { describe, expect, it } from 'vitest';
import { mapResponse, testSourceConnection } from '../generic-fetch';
import { buildSourceUrl } from '../../../shared/source-url';
import type { MediaSource, SourceEndpoint } from '../../../shared/types/sources';

// Realny przykład API źródła: Docchi (https://dev.docchi.pl/docchiapi/series).
//   GET https://api.docchi.pl/v1/series/list        → tablica seriali (root array)
//   GET https://api.docchi.pl/v1/series/find/{slug} → szczegóły (placeholder z rodzica)
// Test offline używa fixture'a odpowiedzi; test live jest bramkowany ONDA_NETWORK_TESTS=1.

const listEndpoint: SourceEndpoint = {
  id: 'series',
  name: 'Series',
  method: 'GET',
  path: '/series/list',
  mapping: {
    fields: { id: 'slug', title: 'title', subtitle: 'title_en', thumbnail: 'cover' }
  },
  childId: 'detail'
};

const detailEndpoint: SourceEndpoint = {
  id: 'detail',
  name: 'Detail',
  method: 'GET',
  path: '/series/find/{slug}',
  mapping: { fields: { id: 'slug', title: 'title', thumbnail: 'cover' } }
};

const docchiSource: MediaSource = {
  id: 'docchi',
  name: 'Docchi',
  baseUrl: 'https://api.docchi.pl/v1',
  auth: { type: 'none' },
  createdAt: 0,
  endpoints: [listEndpoint, detailEndpoint]
};

// Fragment rzeczywistej odpowiedzi /series/list (skrócony).
const SERIES_LIST_FIXTURE = [
  {
    mal_id: 52034,
    title: '"Oshi no Ko"',
    title_en: 'My Star',
    slug: 'oshi-no-ko',
    cover: 'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg',
    genres: ['Drama', 'Supernatural', 'Seinen'],
    episodes: 11,
    series_type: 'TV'
  },
  {
    mal_id: 55791,
    title: '"Oshi no Ko" 2nd Season',
    title_en: '[Oshi No Ko] 2nd Season',
    slug: 'oshi-no-ko-2nd-season',
    cover: 'https://cdn.myanimelist.net/images/anime/1477/136727l.jpg',
    genres: [],
    episodes: null,
    series_type: 'TV'
  }
];

describe('Docchi API — mapowanie listy seriali (offline)', () => {
  it('maps the root array into source items', () => {
    const items = mapResponse(SERIES_LIST_FIXTURE, listEndpoint);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'oshi-no-ko',
      title: '"Oshi no Ko"',
      subtitle: 'My Star',
      thumbnail: 'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg'
    });
    expect(items[1].id).toBe('oshi-no-ko-2nd-season');
  });

  it('keeps the raw object in extra so passKeys/navigation still work', () => {
    const items = mapResponse(SERIES_LIST_FIXTURE, listEndpoint);
    expect(items[0].extra).toMatchObject({ slug: 'oshi-no-ko', series_type: 'TV' });
  });
});

describe('Docchi API — budowa adresu szczegółów (offline)', () => {
  it('resolves the {slug} placeholder from the parent item context', () => {
    const url = buildSourceUrl(docchiSource, detailEndpoint, { context: { slug: 'oshi-no-ko' } });
    expect(url).toBe('https://api.docchi.pl/v1/series/find/oshi-no-ko');
  });

  it('URL-encodes the slug path segment', () => {
    const url = buildSourceUrl(docchiSource, detailEndpoint, { context: { slug: 'a/b c' } });
    expect(url).toBe('https://api.docchi.pl/v1/series/find/a%2Fb%20c');
  });
});

// Opcjonalny test integracyjny na żywo. Włącz:
//   ONDA_NETWORK_TESTS=1 npx vitest run src/main/ipc/__tests__/generic-fetch-docchi.test.ts
const networkEnabled = process.env.ONDA_NETWORK_TESTS === '1';

describe.skipIf(!networkEnabled)('Docchi API — live (ONDA_NETWORK_TESTS=1)', () => {
  it('fetches and maps the live series list', async () => {
    const res = await testSourceConnection(docchiSource, listEndpoint);
    expect(res.success).toBe(true);
    expect(res.sample?.title).toBeTruthy();
    expect(res.raw).toBeDefined();
  }, 30_000);
});
