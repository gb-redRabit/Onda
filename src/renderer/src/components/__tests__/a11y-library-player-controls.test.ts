import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regresja a11y z audytu: wiersz biblioteki miał akcje widoczne tylko po najechaniu,
// przyciski ikon bez nazw, a strefy przewijania wideo były klikalnymi <div>.
const read = (relative: string): string => readFileSync(join(process.cwd(), relative), 'utf8');

const LIB = read('src/renderer/src/components/library/LibraryTrackRow.vue');
const ICON_BUTTON = read('src/renderer/src/components/ui/IconButton.vue');
const PLAYER = read('src/renderer/src/views/PlayerView.vue');
const SEARCH = read('src/renderer/src/components/layout/AppSearch.vue');
const TOASTS = read('src/renderer/src/components/ToastNotification.vue');
const DOWNLOADS = read('src/renderer/src/components/downloads/DownloadRowActions.vue');
const SOURCES_SIDEBAR = read('src/renderer/src/components/sources/SourcesSidebar.vue');
const APP = read('src/renderer/src/App.vue');
const IMAGE_VIEWER = read('src/renderer/src/components/explorer/ImageViewer.vue');

describe('IconButton enforces an accessible name', () => {
  it('requires a label prop and applies it as aria-label', () => {
    expect(ICON_BUTTON).toMatch(/label: string/);
    expect(ICON_BUTTON).toMatch(/:aria-label="label"/);
  });
});

describe('LibraryTrackRow keyboard/AT support', () => {
  it('labels the row checkbox', () => {
    expect(LIB).toMatch(/:aria-label="track\.metadata\?\.title \|\| track\.name"/);
  });

  it('reveals row actions when a child receives keyboard focus', () => {
    expect(LIB).toMatch(/group-focus-within:opacity-100/);
  });

  it('names the cover play button', () => {
    expect(LIB).toMatch(/:aria-label="\$t\('common\.play'\)"/);
  });

  it('uses the labelled IconButton for row actions', () => {
    expect(LIB).toMatch(/<IconButton/);
    expect(LIB).toMatch(/:label="\$t\('common\.editTags'\)"/);
    expect(LIB).toMatch(/:label="\$t\('common\.delete'\)"/);
  });
});

describe('PlayerView skip zones are buttons with names', () => {
  it('exposes labelled seek buttons', () => {
    expect(PLAYER).toMatch(/playerView\.seekBackward/);
    expect(PLAYER).toMatch(/playerView\.seekForward/);
    expect(PLAYER).toMatch(/focus-visible:opacity-100/);
  });
});

describe('Command palette and toasts semantics', () => {
  it('AppSearch is a labelled modal dialog', () => {
    expect(SEARCH).toMatch(/role="dialog"/);
    expect(SEARCH).toMatch(/aria-modal="true"/);
    expect(SEARCH).toMatch(/:aria-label=/);
  });

  it('error toasts are announced assertively', () => {
    expect(TOASTS).toMatch(/n\.type === 'error' \? 'alert'/);
  });
});

describe('additional labelled controls', () => {
  it('download row actions all expose an aria-label', () => {
    const labels = DOWNLOADS.match(/:aria-label="t\('downloads\./g) ?? [];
    expect(labels.length).toBeGreaterThanOrEqual(12);
  });

  it('sources sidebar reveals actions on keyboard focus and labels them', () => {
    expect(SOURCES_SIDEBAR).toMatch(/group-focus-within:opacity-100/);
    expect(SOURCES_SIDEBAR).toMatch(/:aria-label="\$t\('common\.delete'\)"/);
    expect(SOURCES_SIDEBAR).toMatch(/:aria-label="\$t\('sources\.exportSources'\)"/);
  });

  it('app provides a skip link and a focusable main region', () => {
    expect(APP).toMatch(/href="#main-content"/);
    expect(APP).toMatch(/id="main-content"/);
    expect(APP).toMatch(/tabindex="-1"/);
  });

  it('image viewer is a modal dialog', () => {
    expect(IMAGE_VIEWER).toMatch(/role="dialog"/);
    expect(IMAGE_VIEWER).toMatch(/aria-modal="true"/);
  });
});
