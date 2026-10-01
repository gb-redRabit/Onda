import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Audyt wskazał kreator, toasty i menu kontekstowe jako pozbawione semantyki
// dialog / live-region / menu. Ten test pilnuje każdego z nich.

const ROOT = process.cwd();
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const WIZARD = read('src/renderer/src/components/FirstRunWizard.vue');
const TOASTS = read('src/renderer/src/components/ToastNotification.vue');
const MENU = read('src/renderer/src/components/ContextMenu.vue');

describe('FirstRunWizard dialog semantics', () => {
  it('declares itself a modal dialog with a label', () => {
    expect(WIZARD).toMatch(/role="dialog"/);
    expect(WIZARD).toMatch(/aria-modal="true"/);
    expect(WIZARD).toMatch(/aria-labelledby=/);
  });

  it('traps focus via useDialogFocus', () => {
    expect(WIZARD).toMatch(/useDialogFocus\(/);
  });
});

describe('ToastNotification live region', () => {
  it('announces changes to assistive technology', () => {
    expect(TOASTS).toMatch(/aria-live=/);
  });

  it('labels the dismiss button', () => {
    expect(TOASTS).toMatch(/aria-label=/);
  });
});

describe('ContextMenu menu semantics', () => {
  it('is a menu with menu items', () => {
    expect(MENU).toMatch(/role="menu"/);
    expect(MENU).toMatch(/role="menuitem"/);
  });
});
