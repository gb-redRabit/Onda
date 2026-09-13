<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { X } from '@lucide/vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; save: [] }>();
const artist = defineModel<string>('artist', { required: true });
const album = defineModel<string>('album', { required: true });
const year = defineModel<string>('year', { required: true });

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-9999 bg-neutral/50 flex items-center justify-center"
      @click.self="emit('close')"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-box w-80 max-w-[92vw] shadow-2xl overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <h3 class="text-sm font-semibold">{{ t('downloads.editMetadata') }}</h3>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="px-4 py-4 space-y-3">
          <input
            v-model="artist"
            class="w-full px-2 py-1.5 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
            :placeholder="t('youtube.metaArtist')"
          />
          <input
            v-model="album"
            class="w-full px-2 py-1.5 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
            :placeholder="t('youtube.metaAlbum')"
          />
          <input
            v-model="year"
            class="w-full px-2 py-1.5 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
            :placeholder="t('youtube.metaYear')"
          />
        </div>
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-base-300">
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors"
            @click="emit('save')"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
