<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import FormField from '@renderer/components/ui/FormField.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import Switch from '@renderer/components/ui/Switch.vue';

defineProps<{ isSc: boolean }>();
const subsEnabled = defineModel<boolean>('subsEnabled', { required: true });
const subsLangs = defineModel<string>('subsLangs', { required: true });
const subsMode = defineModel<'manual' | 'auto' | 'best'>('subsMode', { required: true });
const subsFormat = defineModel<'srt' | 'vtt' | 'ass'>('subsFormat', { required: true });
const subsFolder = defineModel<boolean>('subsFolder', { required: true });

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc">
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ t('youtube.subsSection') }}
    </p>
    <div class="flex items-center gap-2 text-sm">
      <Switch v-model="subsEnabled" size="sm" :label="t('youtube.subsDownload')" />
      <span>{{ t('youtube.subsDownload') }}</span>
    </div>
    <div v-if="subsEnabled" class="mt-2 space-y-2">
      <FormField :label="t('youtube.subsLangsLabel')">
        <template #default="{ id }">
          <Input :id="id" v-model="subsLangs" :placeholder="t('youtube.subsLangsPlaceholder')" />
        </template>
      </FormField>
      <div class="grid grid-cols-2 gap-2">
        <FormField :label="t('youtube.subsModeLabel')">
          <template #default="{ id }">
            <Select :id="id" v-model="subsMode">
              <option value="best">{{ t('youtube.subsModeBest') }}</option>
              <option value="manual">{{ t('youtube.subsModeManual') }}</option>
              <option value="auto">{{ t('youtube.subsModeAuto') }}</option>
            </Select>
          </template>
        </FormField>
        <FormField :label="t('youtube.subsFormatLabel')">
          <template #default="{ id }">
            <Select :id="id" v-model="subsFormat">
              <option value="srt">SRT</option>
              <option value="vtt">VTT</option>
              <option value="ass">ASS</option>
            </Select>
          </template>
        </FormField>
      </div>
      <div class="flex items-center gap-2 text-xs text-base-content/70">
        <Switch v-model="subsFolder" size="sm" :label="t('youtube.subsFolder')" />
        <span>{{ t('youtube.subsFolder') }}</span>
      </div>
    </div>
  </section>
</template>
