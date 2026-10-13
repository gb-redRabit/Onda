import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Panel napisów ma logikę trudną do zamontowania bez @vue/test-utils, więc te kontrole
// strukturalne chronią okablowanie, którego nie widać w e2e bez sieci: scalone
// wyszukiwanie (OpenSubtitles + NapiProjekt) i kierowanie pobrań do właściwego serwisu.

const PANEL = readFileSync(
  join(process.cwd(), 'src/renderer/src/components/player/SubtitlePanel.vue'),
  'utf8'
);

describe('SubtitlePanel wiring', () => {
  it('queries both providers in parallel and tags each result with its source', () => {
    expect(PANEL).toMatch(/openSubtitlesSearch\(/);
    expect(PANEL).toMatch(/napiProjektCheck\(/);
    expect(PANEL).toMatch(/animeSubSearch\(/);
    expect(PANEL).toMatch(/Promise\.all\(/);
    expect(PANEL).toMatch(/source === 'napi'/);
    expect(PANEL).toMatch(/source === 'an'/);
  });

  it('routes each result to its own download endpoint', () => {
    expect(PANEL).toMatch(/napiProjektDownload\(/);
    expect(PANEL).toMatch(/animeSubDownload\(/);
    expect(PANEL).toMatch(/openSubtitlesDownload\(/);
  });

  it('applies subtitle delay through the shared delay module', () => {
    expect(PANEL).toMatch(/adjustSubtitleDelay\(/);
    expect(PANEL).toMatch(/resetSubtitleDelay\(/);
  });
});
