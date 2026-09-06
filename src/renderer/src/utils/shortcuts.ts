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

  // Support raw shifted symbols (e.g. '>' / '<' are stored without an
  // explicit Shift modifier, but can only be typed with Shift held). Letters
  // and digits stay strict so Ctrl+K ≠ Ctrl+Shift+K.
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