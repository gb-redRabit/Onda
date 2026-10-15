import { logger } from '../../../shared/logger';
import { loadRemoteSubscriptions, updateRemoteSubscription } from './remote-subs-store';
import { listProviderFolder } from './registry';

// Okresowe sprawdzanie subskrypcji LINKÓW (opt-in, domyślnie WYŁĄCZONE — patrz
// syncLinkSubsScheduler). Aktualizuje status (ok/expired/error) i wykrywa NOWE pozycje
// (porównanie z zapisanymi `seenItemIds`). Pierwsze sprawdzenie tylko ustawia bazę.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export function looksExpired(message: string): boolean {
  return /expire|wygas|pass_code|hasło|PROHIBITED|not found|nie znaleziono|404/i.test(message);
}

export async function checkRemoteSubscriptions(filePath: string): Promise<{
  checked: number;
  newItems: number;
  errors: number;
}> {
  if (running) return { checked: 0, newItems: 0, errors: 0 };
  running = true;
  try {
    const subs = await loadRemoteSubscriptions(filePath);
    let checked = 0;
    let newItems = 0;
    let errors = 0;
    for (const sub of subs) {
      try {
        const items = await listProviderFolder(sub.ref);
        const ids = items.map((i) => i.id);
        const seen = new Set(sub.seenItemIds || []);
        // Pierwsze sprawdzenie (brak bazy) nie raportuje „nowych" — tylko ustawia punkt odniesienia.
        const fresh = sub.seenItemIds ? ids.filter((id) => !seen.has(id)) : [];
        await updateRemoteSubscription(filePath, sub.id, {
          status: 'ok',
          lastCheckedAt: Date.now(),
          seenItemIds: ids,
          newCount: fresh.length
        });
        newItems += fresh.length;
        checked++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('providers', 'link sub check failed', msg);
        await updateRemoteSubscription(filePath, sub.id, {
          status: looksExpired(msg) ? 'expired' : 'error',
          lastCheckedAt: Date.now()
        });
        errors++;
      }
    }
    logger.info(
      'providers',
      `link subs check done: checked=${checked} new=${newItems} errors=${errors}`
    );
    return { checked, newItems, errors };
  } finally {
    running = false;
  }
}

export function startLinkSubsChecker(filePath: string, intervalMs = CHECK_INTERVAL_MS): void {
  stopLinkSubsChecker();
  void checkRemoteSubscriptions(filePath);
  timer = setInterval(() => void checkRemoteSubscriptions(filePath), intervalMs);
}

export function stopLinkSubsChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
