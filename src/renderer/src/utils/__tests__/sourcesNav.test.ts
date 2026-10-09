import { describe, expect, it } from 'vitest';
import { itemPassContext, tableRowPassContext } from '../sourcesNav';
import { buildSourceUrl } from '../sourceUrl';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';

// Scenariusz Docchi: lista seriali → strona serialu z tabelą odcinków → odcinek.
// Odtwarza kontekst, który edytor buduje przy testowaniu zagnieżdżonego poziomu
// (ten sam helper, którego używa realna nawigacja).

const listEndpoint: SourceEndpoint = {
  id: 'list',
  name: 'List',
  method: 'GET',
  path: '/series/list',
  mapping: { fields: {} },
  passKeys: [{ from: 'slug', as: 'slug', type: 'string' }]
};
const pageEndpoint: SourceEndpoint = {
  id: 'page',
  name: 'Series',
  method: 'GET',
  path: '/series/find/{slug}',
  mapping: { fields: {} }
};
const episodeEndpoint: SourceEndpoint = {
  id: 'episode',
  name: 'Episode',
  method: 'GET',
  path: '/episodes/find/{slug}/{n}',
  mapping: { fields: {} }
};
const table = {
  mode: 'endpoint' as const,
  path: '/episodes/count/{slug}',
  rowKey: 'anime_episode_number',
  passKeys: [{ from: 'anime_episode_number', as: 'n', type: 'string' as const }]
};
const source: MediaSource = {
  id: 'docchi',
  name: 'Docchi',
  baseUrl: 'https://api.docchi.pl/v1',
  auth: { type: 'none' },
  createdAt: 0,
  endpoints: [listEndpoint, pageEndpoint, episodeEndpoint]
};

describe('drill-down context for Docchi (list → page table → episode)', () => {
  it('maps a list item to its child context (level 1 → 2)', () => {
    const item: SourceItem = {
      id: 'oshi-no-ko',
      title: 'Oshi no Ko',
      type: 'file',
      extra: { slug: 'oshi-no-ko' }
    };
    const ctx = itemPassContext(item, listEndpoint);
    expect(ctx['slug']).toBe('oshi-no-ko');
    expect(buildSourceUrl(source, pageEndpoint, { context: ctx })).toBe(
      'https://api.docchi.pl/v1/series/find/oshi-no-ko'
    );
  });

  it('prefers the pre-resolved passContext shipped from main (no extra)', () => {
    const item: SourceItem = {
      id: 'oshi-no-ko',
      title: 'Oshi no Ko',
      type: 'file',
      passContext: { slug: 'oshi-no-ko' }
    };
    const ctx = itemPassContext(item, listEndpoint);
    expect(ctx['slug']).toBe('oshi-no-ko');
    expect(buildSourceUrl(source, pageEndpoint, { context: ctx })).toBe(
      'https://api.docchi.pl/v1/series/find/oshi-no-ko'
    );
  });

  it('merges the page and the first table row for a table child (level 2 → 3)', () => {
    const pageRaw = { slug: 'nanatsu-no-maken-ga-shihai-suru', title: 'X' };
    const row: SourceItem = {
      id: 'r3',
      title: 'Odcinek 3',
      type: 'file',
      extra: { anime_episode_number: 3, bg: 'https://i.ibb.co/bg.png' }
    };
    const ctx = tableRowPassContext(pageRaw, row, pageEndpoint, table);
    expect(ctx['slug']).toBe('nanatsu-no-maken-ga-shihai-suru');
    expect(ctx['n']).toBe(3);
  });

  it('resolves {slug} and {n} in the episode URL (no literal placeholders / 404)', () => {
    const pageRaw = { slug: 'nanatsu-no-maken-ga-shihai-suru' };
    const row: SourceItem = {
      id: 'r3',
      title: 'Odcinek 3',
      type: 'file',
      extra: { anime_episode_number: 3 }
    };
    const ctx = tableRowPassContext(pageRaw, row, pageEndpoint, table);
    const url = buildSourceUrl(source, episodeEndpoint, { context: ctx });
    expect(url).toBe('https://api.docchi.pl/v1/episodes/find/nanatsu-no-maken-ga-shihai-suru/3');
    expect(url).not.toContain('{');
  });
});
