import { isAbsolute, win32 as win32Path } from 'path';

const MAX_PATH_LENGTH = 4096;

// Argumenty IPC pochodzą z renderera i nigdy nie są zaufane. Te strażniki
// walidują kształt argumentów systemu plików, zanim uruchomi się jakakolwiek operacja fs.

export function isSafeAbsolutePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value || value.length > MAX_PATH_LENGTH) return false;
  if (value.includes('\0')) return false;
  // Akceptuj ścieżkę absolutną w którejkolwiek gramatyce — win32 (C:/... lub C:\...)
  // albo posix (/...). Wywołujący IPC są testowani na wszystkich platformach, a
  // ścieżka jest "safe-absolute" tylko wtedy, gdy jest jednoznacznie absolutna w co
  // najmniej jednej gramatyce.
  return isAbsolute(value) || win32Path.isAbsolute(value);
}

export function isSafeStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length <= MAX_PATH_LENGTH)
  );
}
