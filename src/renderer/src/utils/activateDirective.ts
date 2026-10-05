import type { Directive } from 'vue';

// Nadaje nie-przyciskowym elementom klikalnym semantykę i obsługę klawiatury.
// Wiersze/karty, które zawierają zagnieżdżone kontrolki, nie mogą być `<button>`
// (zagnieżdżone przyciski są niepoprawnym HTML), więc dostają `role="button"`,
// `tabindex="0"` oraz Enter/Spacja wyzwalające `click`. Rejestrowana globalnie
// w `main.ts` jako `v-activate`.

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  // Zdarzenia z zagnieżdżonej kontrolki (np. przycisku w karcie) nie mogą
  // aktywować całego wiersza.
  if (e.target !== e.currentTarget) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).click();
}

export const vActivate: Directive<HTMLElement> = {
  mounted(el) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', onKeydown);
  },
  beforeUnmount(el) {
    el.removeEventListener('keydown', onKeydown);
  }
};
