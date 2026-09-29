import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Ten of the eleven dialogs were plain divs. Without role="dialog" assistive
// technology was never told a dialog had opened, focus stayed on the page
// behind the overlay so tabbing walked the background instead of the dialog's
// controls, and nothing restored focus on close. This guards all of them.

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

describe('dialog semantics', () => {
  it('finds the dialog components it is meant to guard', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it.each(files)('%s declares itself a modal dialog', (file) => {
    const source = readFileSync(file, 'utf8');
    const missing: string[] = [];
    if (!/role="dialog"/.test(source)) missing.push('role="dialog"');
    if (!/aria-modal="true"/.test(source)) missing.push('aria-modal="true"');
    // A dialog with no accessible name is announced as just "dialog".
    if (!/aria-labelledby="/.test(source) && !/aria-label=/.test(source)) {
      missing.push('aria-labelledby / aria-label');
    }
    // tabindex="-1" is what lets focus land on a dialog that has no focusable
    // control of its own.
    if (!/tabindex="-1"/.test(source)) missing.push('tabindex="-1"');
    expect(missing, `${rel(file)} is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(files)('%s wires up the shared focus trap', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(/useDialogFocus\(/.test(source), `${rel(file)} does not call useDialogFocus`).toBe(true);
    // The ref has to be bound to the panel, not left dangling in script.
    expect(/ref="panelRef"/.test(source), `${rel(file)} has no ref="panelRef"`).toBe(true);
  });
});
