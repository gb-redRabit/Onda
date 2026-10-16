import type { Directive } from 'vue';

// Nadaje nie-przyciskowym elementom klikalnym semantykę i obsługę klawiatury.
// Wiersze/karty, które zawierają zagnieżdżone kontrolki, nie mogą być `<button>`
// (zagnieżdżone przyciski są niepoprawnym HTML), więc dostają `role="button"`,
// `tabindex="0"` oraz Enter/Spacja wyzwalające `click`. Rejestrowana globalnie
// w `main.ts` jako `v-activate`.

function isSelf(e: KeyboardEvent): boolean {
  return e.target === e.currentTarget;
}

function onKeydown(e: KeyboardEvent): void {
  if (!isSelf(e)) return;
  // Enter aktywuje na `keydown` (jak natywny przycisk); Spacja dopiero na `keyup`,
  // żeby przytrzymanie klawisza nie klikało wielokrotnie (zgodność z natywnym
  // zachowaniem `<button>` i WCAG 2.1 — „visible focus + activatable”).
  if (e.key === 'Enter') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
  }
}

function onKeyup(e: KeyboardEvent): void {
  if (!isSelf(e)) return;
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
}

export const vActivate: Directive<HTMLElement> = {
  mounted(el) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('keyup', onKeyup);
  },
  beforeUnmount(el) {
    el.removeEventListener('keydown', onKeydown);
    el.removeEventListener('keyup', onKeyup);
  }
};
