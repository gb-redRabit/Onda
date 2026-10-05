import { hashFile } from '../utils/hash';

// Oblicza sumę kontrolną SHA-256 pliku (strumieniowo). Cienka nakładka na wspólną
// implementację `utils/hash`, która zwraca `string | null` z budżetem odczytu; tutaj
// budżetu nie ma, więc wynik jest zawsze stringiem (lub odrzuceniem przy błędzie odczytu).
export async function sha256File(filePath: string): Promise<string> {
  const hash = await hashFile(filePath);
  if (hash === null) throw new Error('hash budget exceeded');
  return hash;
}
