// Podświetlenie celu przeskoku z wyszukiwania ustawień. Klasa CSS jest nadawana
// imperatywnie na element o `id` wpisu z `utils/settingsCatalog.ts`
// (SettingsRow `anchor` / SettingsGroup `id`), a nie przez prop: zakładki mają
// wielu korzeni, więc dziedziczenie atrybutu przez `<component :is>` nie
// działałoby (Vue ostrzega wtedy o „extraneous non-props attributes").
export const SETTINGS_HIGHLIGHT_CLASS = 'settings-field-highlight';

const HIGHLIGHT_DURATION_MS = 1600;
// Zakładki ustawień są leniwe (`defineAsyncComponent`), więc element może pojawić
// się dopiero po dograniu chunku — czekamy do ~600 ms.
const POLL_INTERVAL_MS = 30;
const MAX_POLLS = 20;

let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let highlightedEl: HTMLElement | undefined;

export function clearSettingsHighlight(): void {
  if (highlightTimer !== undefined) {
    clearTimeout(highlightTimer);
    highlightTimer = undefined;
  }
  highlightedEl?.classList.remove(SETTINGS_HIGHLIGHT_CLASS);
  highlightedEl = undefined;
}

export function highlightSettingsElement(
  el: HTMLElement,
  durationMs: number = HIGHLIGHT_DURATION_MS
): void {
  clearSettingsHighlight();
  highlightedEl = el;
  el.classList.add(SETTINGS_HIGHLIGHT_CLASS);
  highlightTimer = setTimeout(clearSettingsHighlight, durationMs);
}

// Zwraca element o `id`, czekając krótko, aż leniwie ładowana zakładka go
// zamontuje. `null`, gdy nie pojawi się w oknie czasowym.
export async function waitForSettingElement(id: string): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const el = document.getElementById(id);
    if (el) return el;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}
