type Translate = (key: string, params?: Record<string, unknown>) => string;

// Opens a text/csv file picker and returns its contents (null when canceled).
export async function pickTextFile(t: Translate): Promise<string | null> {
  const res = (await window.api.invoke('dialog:openFile', {
    filters: [
      { name: t('youtube.textFiles'), extensions: ['txt', 'csv', 'tsv'] },
      { name: t('youtube.allFiles'), extensions: ['*'] }
    ]
  })) as { canceled?: boolean; filePaths?: string[] } | undefined;
  const path = res && !res.canceled ? res.filePaths?.[0] : undefined;
  if (!path) return null;
  return (await window.api.invoke('fs:readTextFile', path)) as string | null;
}

export function batchResultMessage(t: Translate, queued: number, skipped: number): string {
  return (
    t('youtube.batchQueued', { count: queued }) +
    (skipped > 0 ? ' · ' + t('youtube.batchSkipped', { count: skipped }) : '')
  );
}
