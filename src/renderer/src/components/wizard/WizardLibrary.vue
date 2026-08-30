<script setup lang="ts">
import { FolderPlus, X } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';

defineProps<{ scanNow: boolean }>();
const emit = defineEmits<{ (e: 'update:scanNow', value: boolean): void }>();

const library = useLibraryStore();

async function addFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (!paths || paths.length === 0) return;
    for (const p of paths) void library.addFolder(p);
  } catch {
    /* cancelled */
  }
}

function removeFolder(path: string) {
  void library.removeFolder(path);
}
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.libraryTitle') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.libraryDesc') }}</p>

    <div class="mt-5 space-y-2.5">
      <div
        v-for="folder in library.folders"
        :key="folder"
        class="flex items-center gap-3 p-3 rounded-field border border-base-300 bg-base-200/[var(--glass-alpha)]"
      >
        <FolderPlus :size="16" class="text-primary/70 shrink-0" />
        <span class="text-sm truncate">{{ folder }}</span>
        <button
          class="ml-auto p-1 rounded hover:bg-base-content/10 text-base-content/50 hover:text-error transition-colors"
          @click="removeFolder(folder)"
        >
          <X :size="14" />
        </button>
      </div>
      <div v-if="library.folders.length === 0" class="text-sm text-base-content/50 italic">
        {{ $t('wizard.noneSelected') }}
      </div>

      <button
        class="w-full flex items-center gap-3 p-3.5 fx-depth rounded-box border border-dashed border-base-300 hover:border-primary/60 hover:bg-base-content/5 transition-colors text-left"
        @click="addFolder"
      >
        <FolderPlus :size="18" class="text-primary shrink-0" />
        <span class="text-sm font-medium">{{ $t('wizard.libraryAddFolder') }}</span>
      </button>

      <div class="flex items-center justify-between pt-1">
        <label class="text-sm cursor-pointer select-none" for="wizard-scan-now">
          {{ $t('wizard.libraryScanNow') }}
        </label>
        <button
          id="wizard-scan-now"
          type="button"
          role="switch"
          :aria-checked="scanNow"
          class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
          :class="scanNow ? 'bg-primary' : 'bg-base-300'"
          @click="emit('update:scanNow', !scanNow)"
        >
          <span
            class="inline-block h-5 w-5 transform rounded-full bg-neutral-content shadow-md transition-transform duration-200 ease-out"
            :class="scanNow ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <p class="text-xs text-base-content/50 leading-relaxed pt-1">
        {{ $t('wizard.libraryScanHint') }}
      </p>
    </div>
  </div>
</template>
