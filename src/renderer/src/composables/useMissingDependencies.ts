import { computed, ref } from 'vue';
import { logger } from '@shared/logger';
import type { DepToolStatus } from '@shared/types/ipc';
import {
  DEP_LIST,
  EMPTY_DEP_STATUS,
  isStatus,
  recheckDependencies,
  safeCheck
} from '@renderer/utils/dependencies';
import { buildDependencyIssues } from '@renderer/utils/dependencyStatus';
import { depEvents } from '@renderer/utils/depEvents';
import type { DependencyIssue, DepToolName } from '@renderer/utils/dependencyStatus';

function checkApi(tool: DepToolName): (() => Promise<DepToolStatus>) | undefined {
  switch (tool) {
    case 'ffmpeg':
      return window.api?.checkFfmpeg;
    case 'ffprobe':
      return window.api?.checkFfprobe;
    case 'yt-dlp':
      return window.api?.checkYtdlp;
    default:
      return window.api?.checkMkvextract;
  }
}

// Zgłasza, których zależności brakuje Onda (lub które są zepsute), aby aplikacja mogła
// ostrzec użytkownika przy każdym uruchomieniu. Tylko stan: wywołujący decyduje, kiedy sprawdzić
// (baner sprawdza przy montowaniu i przy uaktywnieniu okna), co czyni to testowalnym
// bez montowania komponentu.
export function useMissingDependencies() {
  const issues = ref<DependencyIssue[]>([]);
  const checking = ref(false);
  const dismissed = ref(false);

  const hasIssues = computed(() => issues.value.length > 0);
  const visible = computed(() => hasIssues.value && !dismissed.value);

  async function check(): Promise<void> {
    checking.value = true;
    try {
      // Baner musi odzwierciedlać rzeczywisty system (narzędzie mogło zostać zainstalowane lub
      // usunięte poza aplikacją), więc najpierw odrzucamy zbuforowany wynik sondy.
      await recheckDependencies();
      const results = await Promise.all(
        DEP_LIST.map((dep) => safeCheck(checkApi(dep.tool), { ...EMPTY_DEP_STATUS }))
      );
      issues.value = buildDependencyIssues(
        DEP_LIST.map((dep, i) => ({
          tool: dep.tool,
          name: dep.name,
          status: isStatus(results[i]) ? results[i] : { ...EMPTY_DEP_STATUS }
        }))
      );
    } catch (e) {
      logger.warn('deps', 'missing dependency check failed', e);
    } finally {
      checking.value = false;
    }
  }

  // Ukrywa baner do następnego uruchomienia: brakująca zależność jest warta
  // powtórzenia przy każdym starcie, ale nie warta blokowania bieżącej sesji.
  function dismiss(): void {
    dismissed.value = true;
  }

  // Instalacja/usunięcie w innym miejscu (Ustawienia, kreator) musi od razu wyczyścić
  // baner — bez tego odświeżał się tylko przy uaktywnieniu okna, więc wciąż wymieniał
  // narzędzie, które właśnie zostało zainstalowane.
  const unsubscribe = depEvents.on('changed', () => void check());

  return { issues, hasIssues, visible, checking, check, dismiss, unsubscribe };
}
