export function matchesShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.split('+').map((p) => p.trim());
  const keyPart = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  const ctrl = modifiers.includes('Ctrl');
  const meta = modifiers.includes('Meta');
  const alt = modifiers.includes('Alt');
  const shift = modifiers.includes('Shift');

  if (ctrl !== (e.ctrlKey || false)) return false;
  if (meta !== (e.metaKey || false)) return false;
  if (alt !== (e.altKey || false)) return false;

  // Obsługa surowych symboli z Shiftem (np. '>' / '<' są zapisane bez
  // jawnego modyfikatora Shift, ale można je wpisać tylko z trzymanym Shiftem). Litery
  // i cyfry pozostają ścisłe, więc Ctrl+K ≠ Ctrl+Shift+K.
  const needsShift = keyPart.length === 1 && /[^0-9a-zA-Z ]/.test(keyPart);
  if (shift) {
    if (!e.shiftKey) return false;
  } else if (!needsShift && (e.shiftKey || false)) {
    return false;
  }

  const key = keyPart;
  if (key === 'Space') return e.key === ' ';
  if (key === 'Enter') return e.key === 'Enter';
  if (key === 'Tab') return e.key === 'Tab';
  if (key === 'Escape') return e.key === 'Escape';
  if (/^Arrow/.test(key)) return e.key === key;
  if (/^Media/.test(key)) return e.key === key;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return e.key === key;

  if (key.length === 1) {
    return e.key.toLowerCase() === key.toLowerCase();
  }

  return false;
}

export interface NavShortcutBinding {
  shortcut: string;
  path: string;
}

/**
 * Wstępnie wylicza powiązania skrótów nawigacji z bieżących ustawień, tak by
 * globalny handler keydown nie przebudowywał tabeli akcji i nie odczytywał ponownie
 * `settings.shortcuts` przy każdym naciśnięciu klawisza. Akcje bez przypisanego skrótu są
 * pomijane.
 */
export function navShortcutBindings(
  shortcuts: Record<string, string>,
  actions: Record<string, string>
): NavShortcutBinding[] {
  return Object.entries(actions)
    .map(([action, path]) => ({ shortcut: shortcuts[action], path }))
    .filter((binding): binding is NavShortcutBinding => Boolean(binding.shortcut));
}

// Normalizuje KeyboardEvent do kanonicznego stringa skrótu używanego przez skróty
// komend wtyczek, np. "Ctrl+Shift+K" lub "Alt+F5". Zwraca null dla zdarzeń
// bez modyfikatora lub dla klawiszy niebędących skrótami.
export function matchesPluginShortcut(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.metaKey) mods.push('Meta');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (mods.length === 0) return null;

  const key = e.key?.length === 1 ? e.key.toUpperCase() : e.key;
  if (!key || key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null;
  if (!/^[A-Z0-9]|^(F\d{1,2}|Media\w+)$/.test(key)) return null;

  return [...new Set(mods)].join('+') + '+' + key;
}
