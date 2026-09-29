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

// Reports which dependencies Onda is missing (or has broken) so the app can
// warn the user on every launch. State-only: the caller decides when to check
// (the banner checks on mount and on window focus), which keeps this testable
// without mounting a component.
export function useMissingDependencies() {
  const issues = ref<DependencyIssue[]>([]);
  const checking = ref(false);
  const dismissed = ref(false);

  const hasIssues = computed(() => issues.value.length > 0);
  const visible = computed(() => hasIssues.value && !dismissed.value);

  async function check(): Promise<void> {
    checking.value = true;
    try {
      // The banner must reflect the real system (a tool may have been installed or
      // removed outside the app), so drop the cached probe verdict first.
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

  // Hides the banner until the next launch: a missing dependency is worth
  // repeating every start, but not worth blocking the current session.
  function dismiss(): void {
    dismissed.value = true;
  }

  // An install/removal elsewhere (Settings, wizard) must clear the banner at
  // once — without this it only refreshed on window focus, so it kept listing a
  // tool that had just been installed.
  const unsubscribe = depEvents.on('changed', () => void check());

  return { issues, hasIssues, visible, checking, check, dismiss, unsubscribe };
}
