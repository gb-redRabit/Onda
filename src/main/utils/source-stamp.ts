import { stat } from 'fs/promises';

// Klucz cache unieważniany po edycji pliku: rozmiar + mtime. Współdzielony przez
// cache miniatur i cache transkodowania (wcześniej dwie identyczne kopie).
// Zwraca '' dla brakującego/nieczytelnego pliku, żeby cache mógł pominąć wpis.
export async function sourceStamp(filePath: string): Promise<string> {
  try {
    const s = await stat(filePath);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return '';
  }
}
