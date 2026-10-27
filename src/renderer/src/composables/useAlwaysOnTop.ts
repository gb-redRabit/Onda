import { ref } from 'vue';
import { logger } from '@shared/logger';
import { useSettingsStore } from '@renderer/stores/settings';

// Pin okna jest stanem całej aplikacji, a nie pojedynczego widoku: okno jest jedno,
// więc trzymamy go poza komponentami. Lokalny `ref` w ExplorerView gubił stan po
// przejściu do odtwarzacza — pin „znikał", choć okno zostawało przypięte.
const pinned = ref(false);

async function applyToWindow(flag: boolean): Promise<void> {
  pinned.value = flag;
  try {
    await window.api?.invoke('window:setAlwaysOnTop', flag);
  } catch (e) {
    logger.warn('AlwaysOnTop', 'failed to change window always-on-top', e);
  }
}

export function useAlwaysOnTop() {
  const settings = useSettingsStore();

  /** Aplikuje wartość bez zapisu — start aplikacji i zmiany ustawień z zewnątrz. */
  async function apply(flag: boolean): Promise<void> {
    if (pinned.value === flag) return;
    await applyToWindow(flag);
  }

  /** Przełącza pin i utrwala stan w ustawieniach. */
  async function togglePin(): Promise<void> {
    const next = !pinned.value;
    await applyToWindow(next);
    settings.updateAppearance({ alwaysOnTop: next });
  }

  /** Odtwarza zapisany pin po starcie (także po odtworzeniu okna). */
  async function init(): Promise<void> {
    await applyToWindow(!!settings.appearance.alwaysOnTop);
  }

  return { pinned, apply, togglePin, init };
}
