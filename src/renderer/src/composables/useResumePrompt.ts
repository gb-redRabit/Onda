import { watch, onScopeDispose } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';

// Wspólna obsługa promptu „Wznów od…”: jeden timer, start również dla promptu
// ustawionego PRZED montażem widoku (`immediate: true`), możliwość wstrzymania
// odliczania przy hover/fokusie (WCAG 2.2.1) i akcje kontynuacji/od początku.
// Wcześniej logika była zduplikowana w `AudioView.vue` i `usePlayerControls.ts`,
// a brak `immediate` sprawiał, że prompt ustawiony przy otwarciu pliku z innej trasy
// wisiał bez timera (widok montował się już po zmianie `resumePrompt`).

export interface ResumePromptHandlers {
  /** Kontynuacja od zapisanej pozycji (audio: silnik; wideo: element <video>). */
  onContinue: (prompt: { path: string; position: number }) => void;
  /** Odtwarzanie od początku (czyści zapisaną pozycję). */
  onStart?: (prompt: { path: string; position: number }) => void;
}

export function useResumePrompt(handlers: ResumePromptHandlers) {
  const player = usePlayerStore();
  const settings = useSettingsStore();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function disarm(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function arm(): void {
    disarm();
    const prompt = player.resumePrompt;
    if (!prompt) return;
    const seconds = Math.max(1, settings.playback.resumePromptTimeout || 7);
    timer = setTimeout(() => {
      timer = null;
      player.clearResumePrompt();
    }, seconds * 1000);
  }

  watch(() => player.resumePrompt, arm, { immediate: true });
  onScopeDispose(disarm);

  function onContinue(): void {
    const prompt = player.resumePrompt;
    if (prompt) handlers.onContinue(prompt);
    player.clearResumePrompt();
  }

  function onStart(): void {
    const prompt = player.resumePrompt;
    if (prompt) handlers.onStart?.(prompt);
    player.clearResumePrompt();
  }

  return { pause: disarm, resume: arm, onContinue, onStart };
}
