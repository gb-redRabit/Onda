import { useExplorerStore } from '@renderer/stores/explorer';
import { claimTabDrag } from '@renderer/utils/tabDrag';
import { getWindowId } from '@renderer/utils/windowId';

const TAB_PAYLOAD_PREFIX = 'ONDA_TAB::';

export function encodeTabPayload(windowId: number, path: string): string {
  return TAB_PAYLOAD_PREFIX + encodeURIComponent(JSON.stringify({ wid: windowId, path }));
}

export function parseTabPayload(raw: string): { wid: number; path: string } | null {
  if (!raw.startsWith(TAB_PAYLOAD_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(TAB_PAYLOAD_PREFIX.length))) as {
      wid: number;
      path: string;
    };
    if (typeof parsed.wid !== 'number' || typeof parsed.path !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function handleTabDrop(raw: string): Promise<boolean> {
  const parsed = parseTabPayload(raw);
  if (!parsed) return false;
  const { wid, path } = parsed;
  if (wid === (await getWindowId())) {
    claimTabDrag(path);
    return true;
  }
  const explorer = useExplorerStore();
  explorer.addTab(path);
  window.api?.invoke('explorer:tabMoved', wid, path);
  return true;
}
