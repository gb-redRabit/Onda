import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards the two easy-to-break fixes: the semantic tokens components reference
// must exist, and the glass selector must match both Tailwind class syntaxes.

const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8');

describe('design tokens', () => {
  it('defines the semantic tokens used by components', () => {
    expect(css).toContain('--color-border-default');
    expect(css).toContain('--color-elevated');
  });

  it('blurs both glass class syntaxes', () => {
    expect(css).toContain('(--glass-alpha)');
    expect(css).toContain('[var(--glass-alpha]');
  });

  it('no longer ships the dead field-height and settings transition classes', () => {
    expect(css).not.toContain('.h-field-sm');
    expect(css).not.toContain('.settings-enter-active');
  });
});
