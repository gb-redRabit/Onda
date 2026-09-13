<script setup lang="ts">
import { useI18n } from 'vue-i18n';

withDefaults(defineProps<{ gridClass?: string }>(), { gridClass: 'grid-cols-3 gap-3' });
const artist = defineModel<string>('artist', { required: true });
const album = defineModel<string>('album', { required: true });
const year = defineModel<string>('year', { required: true });

const { t } = useI18n();
</script>

<template>
  <section>
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-1">
      {{ t('youtube.metaSection') }}
    </p>
    <p class="text-[11px] text-base-content/50 mb-2">{{ t('youtube.metaHint') }}</p>
    <div class="grid" :class="gridClass">
      <input
        v-model="artist"
        class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.metaArtist')"
      />
      <input
        v-model="album"
        class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.metaAlbum')"
      />
      <input
        v-model="year"
        class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.metaYear')"
      />
    </div>
  </section>
</template>
