/**
 * Wybór folderu przez natywny dialog. Wspólne dla Ustawień i narzędzi, żeby
 * każdy ekran nie powtarzał wywołania IPC i obsługi anulowania.
 */
export async function pickFolder(): Promise<string | null> {
  const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
  const first = paths?.[0];
  return typeof first === 'string' && first.length > 0 ? first : null;
}
