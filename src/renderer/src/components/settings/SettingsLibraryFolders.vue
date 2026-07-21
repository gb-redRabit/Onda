<script setup lang="ts">
import { computed } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';

const library = useLibraryStore();

async function addFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (!paths || paths.length === 0) return;
    for (const fp of paths) {
      await library.addFolder(fp);
    }
    await library.scanFolders();
  } catch (err) {
    console.error('addFolder error:', err);
  }
}

async function scan() {
  await library.scanFolders();
}

const folderEntries = computed(() =>
  library.folders.map((f) => ({
    path: f,
    type: library.getFolderType(f)
  }))
);

function folderIcon(type: string): string {
  if (type === 'audio') return '🎵';
  if (type === 'video') return '🎬';
  if (type === 'mixed') return '📁';
  return '📁';
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">Foldery biblioteki</h2>
    <p class="text-xs text-fg-faint mb-4">
      Dodaj foldery z mediami do biblioteki. Onda przeskanuje je i skategoryzuje jako audio/wideo.
    </p>

    <div class="flex items-center gap-3">
      <button
        class="px-4 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm font-medium hover:bg-bg-hover transition-colors"
        @click="addFolder"
      >
        Dodaj folder
      </button>
      <button
        class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        :disabled="library.isScanning || library.folders.length === 0"
        @click="scan"
      >
        {{ library.isScanning ? 'Skanowanie...' : 'Skanuj teraz' }}
      </button>
    </div>

    <div v-if="library.folders.length === 0" class="text-sm text-fg-faint italic py-4">
      Brak dodanych folderów. Kliknij "Dodaj folder", aby rozpocząć.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="entry in folderEntries"
        :key="entry.path"
        class="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-default"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-lg">{{ folderIcon(entry.type) }}</span>
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ entry.path }}</div>
            <div class="text-xs text-fg-faint mt-0.5">
              Typ:
              {{
                entry.type === 'audio'
                  ? 'Audio'
                  : entry.type === 'video'
                    ? 'Video'
                    : entry.type === 'mixed'
                      ? 'Mieszany'
                      : 'Nieznany'
              }}
            </div>
          </div>
        </div>
        <button
          class="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
          @click="library.removeFolder(entry.path)"
        >
          Usuń
        </button>
      </div>
    </div>

    <div v-if="library.isScanning" class="text-xs text-fg-faint">
      {{ library.scanProgress.current }} / {{ library.scanProgress.total }} folderów...
    </div>

    <div v-if="library.totalCount > 0" class="text-xs text-fg-faint">
      Łącznie: {{ library.totalCount }} plików ({{ library.audioCount }} audio,
      {{ library.videoCount }} video)
    </div>
  </div>
</template>
