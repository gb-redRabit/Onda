import { nextTick, onBeforeUnmount } from 'vue';
import type { Router } from 'vue-router';

// Płynne przejścia między widokami przez View Transitions API (T7).
// Animujemy tylko `<main>` (`view-transition-name: page-content` w main.css), więc
// pasek boczny, player i status bar nie migają przy nawigacji. Gdy API jest
// niedostępne albo użytkownik włączył ograniczenie ruchu, zostaje dotychczasowe
// przejście Vue (`<transition name="page">`).

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
}

export function useViewTransitions(router: Router): void {
  if (!supportsViewTransitions()) return;

  // Chromium loguje „Transition was skipped. New ViewTransition started”, gdy
  // druga nawigacja startuje w trakcie animacji (np. szybkie kliknięcia w menu).
  // Zamiast pozwalać przeglądarce przerwać poprzednią, po prostu nie animujemy
  // kolejnej — konsola zostaje czysta, a testy nie zbierają fałszywych błędów.
  let running = false;

  const stop = router.beforeResolve((to, from) => {
    // Zmiana samej trasy z parametrami (np. zakładki w Ustawieniach) nie jest
    // przejściem na inny ekran — animowanie jej wyglądałoby jak mruganie.
    if (to.name === from.name) return true;
    if (running) return true;
    if (prefersReducedMotion()) return true;

    return new Promise<void>((resolve) => {
      let settled = false;
      const release = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        // Guard musi puścić nawigację w środku callbacku, a VT czeka na
        // `nextTick`, żeby zdążyć zrobić zrzut już po podmianie komponentu.
        const transition = document.startViewTransition(() => {
          release();
          return nextTick();
        });
        running = true;
        transition.finished
          .catch(() => {})
          .finally(() => {
            running = false;
          });
      } catch {
        // np. trwająca inna tranzycja — nie blokujemy nawigacji
        release();
      }
    });
  });

  onBeforeUnmount(stop);
}
