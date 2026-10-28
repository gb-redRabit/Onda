import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Equalizer.vue to SFC (szablon + ikony), a logika audio/WebAudio jest w
// `useEqualizerPanel`. Te kontrole strukturalne chronią kontrakty, których nie
// widać w e2e: potwierdzenie usunięcia presetu, sanityzacja importu i suwaki.

const EQ = readFileSync(
  join(process.cwd(), 'src/renderer/src/components/player/Equalizer.vue'),
  'utf8'
);
const EQ_PANEL = readFileSync(
  join(process.cwd(), 'src/renderer/src/composables/useEqualizerPanel.ts'),
  'utf8'
);
const BAND = readFileSync(
  join(process.cwd(), 'src/renderer/src/components/player/EqBandRow.vue'),
  'utf8'
);

describe('Equalizer wiring', () => {
  it('confirms before deleting a user preset', () => {
    expect(EQ_PANEL).toMatch(/usePromptDialog\(/);
    expect(EQ).toMatch(/ExplorerPromptDialog/);
    // Usunięcie idzie przez wspólny dialog potwierdzenia (nie od razu na prawy klik).
    expect(EQ_PANEL).toMatch(/prompt\.showConfirm\(t\('equalizer\.presetDeleteConfirm'/);
    expect(EQ_PANEL).toMatch(/setEqUserPresets\(/);
  });

  it('sanitizes imported EQ state before applying it', () => {
    expect(EQ_PANEL).toMatch(/sanitizeEqBands\(/);
    expect(EQ_PANEL).toMatch(/sanitizeEqPreamp\(/);
  });

  it('renders the EQ curve from the shared curve helper', () => {
    expect(EQ_PANEL).toMatch(/eqCurvePath\(/);
  });

  it('exposes band sliders as accessible sliders', () => {
    expect(BAND).toMatch(/role="slider"/);
    expect(BAND).toMatch(/aria-valuenow/);
    expect(BAND).toMatch(/aria-valuemin/);
    expect(BAND).toMatch(/aria-valuemax/);
  });
});
