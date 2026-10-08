<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SourceAuthType } from '@renderer/types/sources';
import FieldLabel from './FieldLabel.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SourceIconSection from './SourceIconSection.vue';
import SourceDownloadSection from './SourceDownloadSection.vue';

// Faza 0 — wszystko o samym źródle: nazwa, ikona, adres bazowy, uwierzytelnianie,
// zaufanie do sieci prywatnej i preferencje pobierania.
defineProps<{
  defaultDownloadDir: string;
  apiKeyOptions: Array<{ id: string; label: string }>;
}>();
const emit = defineEmits<{ error: [message: string] }>();

const name = defineModel<string>('name', { required: true });
const icon = defineModel<string>('icon', { required: true });
const baseUrl = defineModel<string>('baseUrl', { required: true });
const allowPrivateNetwork = defineModel<boolean>('allowPrivateNetwork', { required: true });
const authType = defineModel<SourceAuthType>('authType', { required: true });
const apiKeyId = defineModel<string>('apiKeyId', { required: true });
const headerName = defineModel<string>('headerName', { required: true });
const queryParam = defineModel<string>('queryParam', { required: true });
const downloadOutputDir = defineModel<string>('downloadOutputDir', { required: true });
const downloadFolder = defineModel<boolean>('downloadFolder', { required: true });

const { t } = useI18n();
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-1 gap-3">
      <div>
        <FieldLabel :text="t('sources.name')" />
        <input
          v-model="name"
          type="text"
          :placeholder="t('sources.namePlaceholder')"
          class="w-full px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.baseUrl')" />
        <input
          v-model="baseUrl"
          type="text"
          placeholder="https://api.example.com"
          class="w-full px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div class="flex items-start gap-2.5 rounded-field border border-warning/30 bg-warning/5 p-3">
        <SettingsToggle
          v-model="allowPrivateNetwork"
          :label="t('sources.trustPrivateNetwork')"
          class="mt-0.5"
        />
        <span class="min-w-0">
          <span class="block text-xs font-medium text-base-content">
            {{ t('sources.trustPrivateNetwork') }}
          </span>
          <span class="block mt-0.5 text-[11px] text-base-content/55">
            {{ t('sources.trustPrivateNetworkDescription') }}
          </span>
        </span>
      </div>
    </div>

    <SourceIconSection v-model:icon="icon" @error="emit('error', $event)" />

    <div class="space-y-2">
      <FieldLabel :text="t('sources.auth')" />
      <div class="flex flex-wrap gap-2">
        <select
          v-model="authType"
          class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="none">{{ t('sources.authNone') }}</option>
          <option value="apikey">{{ t('sources.authApiKey') }}</option>
          <option value="bearer">{{ t('sources.authBearer') }}</option>
        </select>
        <template v-if="authType !== 'none'">
          <select
            v-model="apiKeyId"
            class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{{ t('sources.chooseKey') }}</option>
            <option v-for="k in apiKeyOptions" :key="k.id" :value="k.id">{{ k.label }}</option>
          </select>
          <template v-if="authType === 'apikey'">
            <input
              v-model="headerName"
              type="text"
              :placeholder="t('sources.headerName')"
              class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              v-model="queryParam"
              type="text"
              :placeholder="t('sources.queryParam')"
              class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </template>
        </template>
      </div>
    </div>

    <SourceDownloadSection
      v-model:output-dir="downloadOutputDir"
      v-model:folder="downloadFolder"
      :default-dir="defaultDownloadDir"
    />
  </div>
</template>
