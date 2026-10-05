import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regresja a11y z audytu: przełączniki bez dostępnej nazwy, submenu menu
// kontekstowego tylko na hover, zagnieżdżone <button> w karcie utworu.
const read = (relative: string): string => readFileSync(join(process.cwd(), relative), 'utf8');

const ROW = read('src/renderer/src/components/settings/SettingsRow.vue');
const TOGGLE = read('src/renderer/src/components/settings/SettingsToggle.vue');
const ROW_LABEL = read('src/renderer/src/components/settings/settingsRowLabel.ts');
const MENU = read('src/renderer/src/components/ContextMenu.vue');
const CARD = read('src/renderer/src/components/library/LibraryTrackCard.vue');

describe('settings toggle accessible name', () => {
  it('provides the row label and the toggle consumes it', () => {
    expect(ROW_LABEL).toMatch(/SETTINGS_ROW_LABEL/);
    expect(ROW).toMatch(/provide\(\s*SETTINGS_ROW_LABEL/);
    expect(TOGGLE).toMatch(/inject\(SETTINGS_ROW_LABEL/);
    expect(TOGGLE).toMatch(/:aria-label="accessibleName"/);
  });
});

describe('context menu keyboard support', () => {
  it('exposes submenu state and handles arrow/enter keys', () => {
    expect(MENU).toMatch(/aria-haspopup/);
    expect(MENU).toMatch(/aria-expanded/);
    expect(MENU).toMatch(/openSubKeyboard/);
    expect(MENU).toMatch(/ArrowRight/);
    expect(MENU).toMatch(/role="menu"/); // submenu też jest menu
  });
});

describe('library track card is not a nested button', () => {
  it('uses role="button" root instead of a <button>', () => {
    expect(CARD).toMatch(/role="button"/);
    expect(CARD).toMatch(/tabindex="0"/);
    // Root nie może być <button>, bo w środku są przyciski akcji.
    expect(CARD).not.toMatch(/<button\s+data-testid="library-track-card"/);
  });
});
