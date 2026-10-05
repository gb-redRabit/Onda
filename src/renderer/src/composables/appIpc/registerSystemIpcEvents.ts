import type { Router } from 'vue-router';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';
import { createListenerScope } from './listeners';

// Pliki otwarte z systemu: skojarzenia plików / przekazywanie single-instance
// oraz pliki zakolejkowane, gdy aplikacja jeszcze się uruchamiała. Filtrowanie
// wejścia trzymamy w jednym helperze, bo oba kanały niosą tę samą, niezaufaną
// tablicę ścieżek.
function openSystemPaths(paths: unknown, router: Router): void {
  if (!Array.isArray(paths)) return;
  const files = paths.filter((p): p is string => typeof p === 'string');
  if (files.length) void openMediaFiles(files, router);
}

export function registerSystemIpcEvents(router: Router): () => void {
  const { listen, dispose } = createListenerScope();

  listen('open-files', (paths: unknown) => openSystemPaths(paths, router));

  void (async () => {
    try {
      const pending = (await window.api?.invoke('app:getPendingFiles')) as string[] | undefined;
      openSystemPaths(pending, router);
    } catch {
      /* oczekujące pliki niedostępne */
    }
  })();

  return dispose;
}
