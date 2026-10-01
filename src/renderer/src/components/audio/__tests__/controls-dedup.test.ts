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

// Cztery pełne warianty transportu były czterema kopiami tych samych ośmiu przycisków:
// te same handlery, te same dostępne nazwy, różniące się tylko kilkoma klasami Tailwind
// i tym, z którego tokenu rozmiaru czytają ikony. Dlatego dostępne nazwy i
// obsługiwany z klawiatury suwak głośności trzeba było dodać cztery razy, i dlatego
// przegląd nie potrafił stwierdzić, które kopie pominięto.

const AUDIO_DIR = join(process.cwd(), 'src/renderer/src/components/audio');

describe('transport controls are not duplicated per layout', () => {
  it('ships one transport component, not one per variant', () => {
    const variants = readdirSync(AUDIO_DIR).filter((f) => /^AudioControls[A-Z]/.test(f));
    // AudioControlsCore (wszystkie układy) i AudioControlsMicro (tylko odtwarzanie). Nowy
    // AudioControlsXxx.vue tutaj to duplikacja, przed którą to chroni.
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
      // Tokeny rozmiaru są kluczowane trybem układu, więc gęstość bez niego
      // renderowałaby niezdefiniowane rozmiary.
      expect(ICON[mode]).toBeGreaterThan(0);
      expect(ICON_SM[mode]).toBeGreaterThan(0);
      expect(PLAY_SIZE[mode]).toBeGreaterThan(0);
      expect(PLAY_BOX[mode]).toBeTruthy();
      if (d.extras) expect(d.extrasButton).toBeTruthy();
    }
  });

  it('only gates the transport row on width for the minimal layout', () => {
    // minimal łączy odcięty wiersz transportu z fallbackiem tylko do odtwarzania i wierszem
    // głośności pokazywanym w przeciwnej sytuacji; pozostałe zawsze pokazują ten wiersz.
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
    // Komentarz dispatchera je dokumentuje; zmiana tutaj zmienia rozmiar UI dla
    // wszystkich, więc jest sprawdzana, a nie pozostawiona komentarzowi.
    expect(calcMode(400, 20)).toBe('micro');
    expect(calcMode(300, 130)).toBe('wide');
    expect(calcMode(200, 110)).toBe('compact');
    expect(calcMode(150, 150)).toBe('tall');
    expect(calcMode(150, 60)).toBe('minimal');
  });
});
