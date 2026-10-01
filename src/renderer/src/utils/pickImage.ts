/**
 * Pyta proces główny o obraz i zwraca wybraną ścieżkę.
 *
 * Trzy komponenty otwierały wybór obrazu i każdy ponownie implementował to samo
 * odwijanie wyniku dialogu: wyjdź, gdy użytkownik anulował, wyjdź, gdy nie wróciła
 * żadna ścieżka, w przeciwnym razie weź pierwszą. Typ wyniku był deklarowany
 * per miejsce wywołania inline castem, więc zmiana kształtu IPC zepsułaby
 * każdy z nich osobno.
 *
 * Zwraca null, gdy dialog jest niedostępny (brak bridge preload), anulowany, albo
 * zwraca nic użytecznego.
 */
export async function pickImagePath(): Promise<string | null> {
  const result = await window.api?.openImageDialog();
  if (!result || result.canceled) return null;
  return result.filePaths?.[0] ?? null;
}
