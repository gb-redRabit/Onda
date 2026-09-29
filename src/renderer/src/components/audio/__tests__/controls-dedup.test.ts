import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DENSITY,
  ICON,
  ICON_SM,
  PLAY_BOX,
  PLAY_SIZE,
  calcMode
} from '@renderer/utils/audioControls';

// The four full transport variants were four copies of the same eight buttons:
// same handlers, same accessible names, differing only in a few Tailwind classes
// and which size token the icons read from. That is why the accessible names and
// the keyboard-operable volume slider had to be added four times, and why a
// review could not tell which copies had been missed.

const AUDIO_DIR = join(process.cwd(), 'src/renderer/src/components/audio');

describe('transport controls are not duplicated per layout', () => {
  it('ships one transport component, not one per variant', () => {
    const variants = readdirSync(AUDIO_DIR).filter((f) => /^AudioControls[A-Z]/.test(f));
    // AudioControlsCore (all layouts) and AudioControlsMicro (play only). A new
    // AudioControlsXxx.vue here is the duplication this guards against.
    expect(variants.sort()).toEqual(['AudioControlsCore.vue', 'AudioControlsMicro.vue']);
  });

  it('routes every non-micro layout through the shared component', () => {
    const dispatcher = readFileSync(join(AUDIO_DIR, 'AudioControls.vue'), 'utf8');
    expect(dispatcher).toContain('AudioControlsCore');
    expect(dispatcher).not.toMatch(/AudioControls(Compact|Wide|Tall|Minimal)/);
  });

  it('gives every layout a density row and matching size tokens', () => {
    for (const mode of ['wide', 'tall', 'compact', 'minimal'] as const) {
      const d = DENSITY[mode];
      expect(d, `no density for ${mode}`).toBeTruthy();
      expect(d.container).toBeTruthy();
      expect(d.transport).toBeTruthy();
      expect(d.glow).toBeTruthy();
      expect(d.volumeRow).toBeTruthy();
      // The size tokens are keyed by layout mode, so a density without one
      // would render undefined sizes.
      expect(ICON[mode]).toBeGreaterThan(0);
      expect(ICON_SM[mode]).toBeGreaterThan(0);
      expect(PLAY_SIZE[mode]).toBeGreaterThan(0);
      expect(PLAY_BOX[mode]).toBeTruthy();
      if (d.extras) expect(d.extrasButton).toBeTruthy();
    }
  });

  it('only gates the transport row on width for the minimal layout', () => {
    // minimal pairs a gated transport row with a play-only fallback and a volume
    // row shown in the opposite condition; the others always show the row.
    expect(DENSITY.minimal.gateTransportOnWidth).toBe(true);
    expect(DENSITY.minimal.volume).toBe('whenNarrow');
    expect(DENSITY.minimal.extras).toBe(false);
    for (const mode of ['wide', 'tall', 'compact'] as const) {
      expect(DENSITY[mode].gateTransportOnWidth, mode).toBe(false);
      expect(DENSITY[mode].volume, mode).toBe('whenNotCompact');
      expect(DENSITY[mode].extras, mode).toBe(true);
    }
  });

  it('keeps the layout mode boundaries unchanged', () => {
    // The dispatcher comment documents these; a change here resizes the UI for
    // everyone, so it is asserted rather than left to the comment.
    expect(calcMode(400, 20)).toBe('micro');
    expect(calcMode(300, 130)).toBe('wide');
    expect(calcMode(200, 110)).toBe('compact');
    expect(calcMode(150, 150)).toBe('tall');
    expect(calcMode(150, 60)).toBe('minimal');
  });
});
