<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import FormField from '@renderer/components/ui/FormField.vue';
import Input from '@renderer/components/ui/Input.vue';

withDefaults(defineProps<{ gridClass?: string }>(), { gridClass: 'grid-cols-3 gap-3' });
const artist = defineModel<string>('artist', { required: true });
const album = defineModel<string>('album', { required: true });
const year = defineModel<string>('year', { required: true });

const { t } = useI18n();
</script>

<template>
  <section>
    <p class="mb-1 text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ t('youtube.metaSection') }}
    </p>
    <p class="mb-2 text-[11px] text-base-content/50">{{ t('youtube.metaHint') }}</p>
    <div class="grid" :class="gridClass">
      <FormField :label="t('youtube.metaArtist')">
        <template #default="{ id }">
          <Input :id="id" v-model="artist" />
        </template>
      </FormField>
      <FormField :label="t('youtube.metaAlbum')">
        <template #default="{ id }">
          <Input :id="id" v-model="album" />
        </template>
      </FormField>
      <FormField :label="t('youtube.metaYear')">
        <template #default="{ id }">
          <Input :id="id" v-model="year" inputmode="numeric" />
        </template>
      </FormField>
    </div>
  </section>
</template>
