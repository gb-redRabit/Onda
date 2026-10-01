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

const SHELL = join(COMPONENTS, 'ui/ModalShell.vue');
const shellSource = readFileSync(SHELL, 'utf8');

/**
 * A dialog may either declare the semantics itself or delegate them to
 * ModalShell, which owns the panel and the focus trap. Delegating is not a way
 * around the requirement — ModalShell is checked by its own test below — but it
 * does mean the attributes legitimately live in another file.
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
      // Still has to name itself, or the dialog is announced as bare "dialog".
      expect(
        /labelled-by=/.test(source) || /aria-label=/.test(source),
        `${rel(file)} delegates to ModalShell but gives it no accessible name`
      ).toBe(true);
      return;
    }
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
    if (delegatesToShell(source)) {
      // ModalShell calls useDialogFocus on the panel it renders, so the dialog
      // inherits the trap and the focus restore.
      return;
    }
    expect(/useDialogFocus\(/.test(source), `${rel(file)} does not call useDialogFocus`).toBe(true);
    // The ref has to be bound to the panel, not left dangling in script.
    expect(/ref="panelRef"/.test(source), `${rel(file)} has no ref="panelRef"`).toBe(true);
  });
});
