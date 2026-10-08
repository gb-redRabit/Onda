// Otwiera player/embed w dedykowanym oknie podglądu (izolowana sesja: adblock +
// spoof nagłówków). Best-effort — brak API lub błąd nie może wywrócić UI.
export async function openPreviewWindow(url: string | undefined, title?: string): Promise<void> {
  if (!url) return;
  try {
    await window.api?.invoke('preview:open', url, title ? { title } : undefined);
  } catch {
    // ignore
  }
}
