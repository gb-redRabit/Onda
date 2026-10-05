import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regresja UX: pojedynczy utwór w zakładce Utwory musi dać się zaznaczyć tak samo
// jak wielokrotny wybór (checkbox w liście i na karcie), a pasek zbiorczy musi
// mówić wprost o utworze, gdy wybrany jest dokładnie jeden.
const read = (relative: string): string => readFileSync(join(process.cwd(), relative), 'utf8');

const BULK = read('src/renderer/src/components/library/LibraryTracksBulkBar.vue');
const CARD = read('src/renderer/src/components/library/LibraryTrackCard.vue');
const EN = read('src/renderer/src/locales/en.ts');
const PL = read('src/renderer/src/locales/pl.ts');

describe('LibraryTracksBulkBar singular/plural wording', () => {
  it('switches to track-specific labels for a single selection', () => {
    expect(BULK).toMatch(/isSingle/);
    expect(BULK).toMatch(/\$t\('common\.addTrackToQueue'\)/);
    expect(BULK).toMatch(/\$t\('common\.addTrackToPlaylist'\)/);
  });
});

const CARD_SRC = read('src/renderer/src/components/library/LibraryTrackCard.vue');
const TAB = read('src/renderer/src/components/library/LibraryTracksTab.vue');

describe('single/multi-track selection in grid and list', () => {
  it('renders a labelled checkbox on the card that selects additively', () => {
    expect(CARD_SRC).toMatch(/type="checkbox"/);
    expect(CARD_SRC).toMatch(/:aria-label="track\.metadata\?\.title \|\| track\.name"/);
    // Checkbox przełącza (additive), a nie zastępuje zaznaczenie.
    expect(CARD_SRC).toMatch(/onCheckboxClick/);
    expect(CARD_SRC).toMatch(/emit\('select', e, true\)/);
  });

  it('plain click and checkbox both toggle (multi-select without modifiers)', () => {
    expect(typeof CARD).toBe('string'); // sanity: plik istnieje
    expect(TAB).toMatch(/selection\.toggle\(/);
    // Shift jest jedynym modyfikatorem, jaki zostaje (zakres).
    expect(TAB).toMatch(/selectRange/);
  });

  it('measures virtual grid rows instead of a fixed estimate (no overlap)', () => {
    // Wysokość wiersza musi być mierzona; stały estimateSize rozjeżdżał siatkę.
    expect(TAB).toMatch(/measureElement/);
  });
});

describe('i18n parity for the new labels', () => {
  it('defines the single-track keys in both locales', () => {
    expect(EN).toMatch(/addTrackToQueue:/);
    expect(EN).toMatch(/addTrackToPlaylist:/);
    expect(PL).toMatch(/addTrackToQueue:/);
    expect(PL).toMatch(/addTrackToPlaylist:/);
  });
});
