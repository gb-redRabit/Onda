import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Dziesięć z jedenastu dialogów było zwykłymi divami. Bez role="dialog" technologie
// wspomagające nigdy nie dowiadywały się, że otwarto dialog, fokus zostawał na stronie
// za nakładką, więc tabowanie chodziło po tle zamiast po kontrolkach dialogu,
// a zamknięcie niczego nie przywracało fokusu. Ten test pilnuje ich wszystkich.

const COMPONENTS = join(process.cwd(), 'src/renderer/src/components');

function dialogFiles(dir: string = COMPONENTS): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : dialogFiles(full);
    }
    return /(Modal|Dialog)\.vue$/.test(entry) ? [full] : [];
  });
}

const files = dialogFiles();
const rel = (f: string) => f.replace(`${process.cwd()}\\`, '').replace(/\\/g, '/');

const SHELL = join(COMPONENTS, 'ui/ModalShell.vue');
const shellSource = readFileSync(SHELL, 'utf8');

/**
 * Dialog może albo sam deklarować semantykę, albo delegować ją do
 * ModalShell, który posiada panel i focus trap. Delegowanie nie jest obejściem
 * wymogu — ModalShell jest sprawdzany przez własny test poniżej — ale
 * oznacza, że atrybuty legalnie żyją w innym pliku.
 */
function delegatesToShell(source: string): boolean {
  return /<ModalShell[\s>]/.test(source);
}

describe('dialog semantics', () => {
  it('finds the dialog components it is meant to guard', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it('ModalShell itself carries the semantics every delegating dialog relies on', () => {
    const missing: string[] = [];
    if (!/role="dialog"/.test(shellSource)) missing.push('role="dialog"');
    if (!/aria-modal="true"/.test(shellSource)) missing.push('aria-modal="true"');
    if (!/aria-labelledby/.test(shellSource)) missing.push('aria-labelledby');
    if (!/tabindex="-1"/.test(shellSource)) missing.push('tabindex="-1"');
    expect(missing, `ui/ModalShell.vue is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(files)('%s declares itself a modal dialog', (file) => {
    const source = readFileSync(file, 'utf8');
    if (delegatesToShell(source)) {
      // Wciąż musi się nazwać, inaczej dialog jest ogłaszany jako samo "dialog".
      expect(
        /labelled-by=/.test(source) || /aria-label=/.test(source),
        `${rel(file)} delegates to ModalShell but gives it no accessible name`
      ).toBe(true);
      return;
    }
    const missing: string[] = [];
    if (!/role="dialog"/.test(source)) missing.push('role="dialog"');
    if (!/aria-modal="true"/.test(source)) missing.push('aria-modal="true"');
    // Dialog bez dostępnej nazwy jest ogłaszany jako samo "dialog".
    if (!/aria-labelledby="/.test(source) && !/aria-label=/.test(source)) {
      missing.push('aria-labelledby / aria-label');
    }
    // tabindex="-1" pozwala fokusowi trafić na dialog, który nie ma własnej
    // kontrolki fokusowalnej.
    if (!/tabindex="-1"/.test(source)) missing.push('tabindex="-1"');
    expect(missing, `${rel(file)} is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(files)('%s wires up the shared focus trap', (file) => {
    const source = readFileSync(file, 'utf8');
    if (delegatesToShell(source)) {
      // ModalShell wywołuje useDialogFocus na renderowanym panelu, więc dialog
      // dziedziczy trap i przywracanie fokusu.
      return;
    }
    expect(/useDialogFocus\(/.test(source), `${rel(file)} does not call useDialogFocus`).toBe(true);
    // Ref musi być przypięty do panelu, a nie zostawiony luźno w skrypcie.
    expect(/ref="panelRef"/.test(source), `${rel(file)} has no ref="panelRef"`).toBe(true);
  });
});
