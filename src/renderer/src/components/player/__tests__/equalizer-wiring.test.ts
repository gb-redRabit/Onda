import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Equalizer.vue to duży SFC (UI + okablowanie audio/WebAudio) trudny do zamontowania
// bez @vue/test-utils, więc te kontrole strukturalne chronią kontrakty, których nie
// widać w e2e: potwierdzenie usunięcia presetu, sanityzacja importu i dostępność suwaków.

const EQ = readFileSync(
  join(process.cwd(), 'src/renderer/src/components/player/Equalizer.vue'),
  'utf8'
);

describe('Equalizer wiring', () => {
  it('confirms before deleting a user preset', () => {
    expect(EQ).toMatch(/usePromptDialog\(/);
    expect(EQ).toMatch(/ExplorerPromptDialog/);
    // Usunięcie idzie przez wspólny dialog potwierdzenia (nie od razu na prawy klik).
    expect(EQ).toMatch(/prompt\.showConfirm\(t\('equalizer\.presetDeleteConfirm'/);
    expect(EQ).toMatch(/setEqUserPresets\(/);
  });

  it('sanitizes imported EQ state before applying it', () => {
    expect(EQ).toMatch(/sanitizeEqBands\(/);
    expect(EQ).toMatch(/sanitizeEqPreamp\(/);
  });

  it('renders the EQ curve from the shared curve helper', () => {
    expect(EQ).toMatch(/eqCurvePath\(/);
  });

  it('exposes band sliders as accessible sliders', () => {
    expect(EQ).toMatch(/role="slider"/);
    expect(EQ).toMatch(/aria-valuenow/);
    expect(EQ).toMatch(/aria-valuemin/);
    expect(EQ).toMatch(/aria-valuemax/);
  });
});
