import { rename, rm, unlink } from 'fs/promises';

// Atomowa podmiana pliku docelowego. `fs.rename` nadpisuje istniejący cel na
// wszystkich platformach (Windows: MOVEFILE_REPLACE_EXISTING), więc NIE wolno
// usuwać oryginału przed `rename` — inaczej awaria pomiędzy `unlink` a `rename`
// zostawia użytkownika bez pliku. Na Windows plik docelowy bywa chwilowo
// zablokowany (antywirus, serwer mediów) → ponawiamy krótko.
export async function replaceFileAtomic(src: string, target: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await rename(src, target);
      return;
    } catch (e) {
      lastError = e;
      const code = (e as { code?: string } | undefined)?.code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw e;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  throw lastError;
}

// Usuwa plik ignorując błędy (brak pliku, chwilowa blokada). Zastępuje
// powtarzane `unlink(x).catch(() => undefined)`.
export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // brak pliku lub zablokowany — nic do zrobienia
  }
}

// Usuwa plik/katalog ignorując błędy. Zastępuje powtarzane
// `rm(x, { recursive, force }).catch(() => undefined)`.
export async function safeRm(path: string, recursive = false): Promise<void> {
  try {
    await rm(path, { recursive, force: true });
  } catch {
    // brak zasobu lub zablokowany — nic do zrobienia
  }
}
