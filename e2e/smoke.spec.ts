import { test, expect } from '@playwright/test';
import { launchOnda, readBootPhasesFromLog, dismissWizard, STARTUP_BUDGET_MS } from './helpers/app';

test.describe('app smoke', () => {
  test('boots the renderer with a working IPC bridge and closes cleanly', async () => {
    const onda = await launchOnda();
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await expect(onda.page).toHaveTitle('Onda');

      const phases = await readBootPhasesFromLog(onda.userDataDir);
      const windowPhase = phases.find((phase) => phase.label === 'window created');
      const summary = `launch=${onda.startupMs}ms window=${windowPhase?.ms ?? '?'}ms phases=${phases
        .map((phase) => `${phase.label}:${phase.ms}ms`)
        .join(',')}`;
      console.log(`[Onda/perf] ${summary}`);
      test.info().annotations.push({ type: 'startup', description: summary });

      // Budżet jest celowo luźny (2-3x normalnego startu): łapie regresje typu
      // „nowy ciężki import w main”, a nie szum wolnego runnera.
      expect(windowPhase, 'main process never logged the window created phase').toBeTruthy();
      expect(onda.startupMs, `startup exceeded ${STARTUP_BUDGET_MS}ms: ${summary}`).toBeLessThan(
        STARTUP_BUDGET_MS
      );

      // Pierwsze uruchomienie na świeżym profilu: odrzuć kreatora onboardingu.
      await dismissWizard(onda.page);
      await expect(onda.page.getByTestId('wizard-skip')).toHaveCount(0);

      const bridge = await onda.page.evaluate(() => {
        const api = (window as unknown as { api?: { invoke?: unknown; on?: unknown } }).api;
        return {
          invoke: typeof api?.invoke === 'function',
          on: typeof api?.on === 'function'
        };
      });
      expect(bridge).toEqual({ invoke: true, on: true });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
