import { ref } from 'vue';
import { prepareSessionForRestart } from './useSessionPersistence';

/**
 * Przełączenie pełnego okna na compact. W Core-shell to natychmiastowa podmiana
 * okna; w klasycznym mainie main procesu restartuje aplikację, więc najpierw
 * zapisujemy sesję (utwór + kolejka) do jednorazowego odtworzenia w compactcie.
 */
export function useCompactSwitch() {
  const switching = ref(false);

  async function switchToCompact(): Promise<void> {
    if (switching.value) return;
    switching.value = true;
    try {
      // Main odpowiada, czy ten renderer jest shellem Core. Tylko legacy main
      // wymaga restartu i przygotowania sesji.
      const coreShell = await window.api?.invoke('app:isCoreShell');
      if (coreShell !== true) {
        prepareSessionForRestart();
      }
      await window.api?.invoke('app:setWindowMode', 'compact');
    } catch {
      /* okno pozostaje w bieżącym trybie */
    } finally {
      // W Core-shell main tylko się chowa, więc po powrocie przycisk musi być
      // znowu aktywny (proces nie został zrestartowany).
      switching.value = false;
    }
  }

  return { switching, switchToCompact };
}
