<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import type { YoutubeAuthMethod } from '@renderer/types/settings';

const settings = useSettingsStore();
const { t } = useI18n();
const { status, refresh, ensureLoaded } = useYoutubeAuth();
ensureLoaded();

const methods: Array<{ value: YoutubeAuthMethod; labelKey: string }> = [
  { value: 'none', labelKey: 'settings.authDisabled' },
  { value: 'electron', labelKey: 'settings.authElectron' },
  { value: 'manual', labelKey: 'settings.authManual' },
  { value: 'browser', labelKey: 'settings.authBrowser' }
];

const browsers = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
  { value: 'safari', label: 'Safari' }
];

const isBusy = ref(false);
const errorMsg = ref('');

const lastLoginText = computed(() => {
  if (!status.value.lastLogin) return '';
  return new Date(status.value.lastLogin).toLocaleString();
});

async function setMethod(m: YoutubeAuthMethod) {
  settings.updateYoutube({ method: m });
  await refresh();
}

async function refreshAll() {
  await settings.load();
  await refresh();
}

async function doLogin() {
  isBusy.value = true;
  errorMsg.value = '';
  try {
    const res = await window.api.invoke('yt:login');
    if (res.error) errorMsg.value = res.error;
    await refreshAll();
  } finally {
    isBusy.value = false;
  }
}

async function doLogout() {
  isBusy.value = true;
  errorMsg.value = '';
  try {
    await window.api.invoke('yt:logout');
    await refreshAll();
  } finally {
    isBusy.value = false;
  }
}

async function doImport() {
  isBusy.value = true;
  errorMsg.value = '';
  try {
    const res = await window.api.invoke('yt:importCookies');
    if (res.error) errorMsg.value = res.error;
    await refreshAll();
  } finally {
    isBusy.value = false;
  }
}

async function doExport() {
  if (!window.confirm(t('settings.cookiesExportWarning'))) return;
  await window.api.invoke('yt:exportCookies');
}

function onBrowserChange(e: Event) {
  settings.updateYoutube({ cookiesBrowser: (e.target as HTMLSelectElement).value });
}


</script>

<template>
  <SettingsPanel :title="$t('settings.downloadSection')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.googleAccount')"
        :description="$t('settings.googleAccountDesc')"
      />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          v-for="m in methods"
          :key="m.value"
          class="fx-noise px-4 py-2 fx-depth rounded-field text-sm border transition-colors"
          :class="
            settings.youtube.method === m.value
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : 'border-base-300 text-base-content/70 hover:bg-base-content/10'
          "
          @click="setMethod(m.value)"
        >
          {{ $t(m.labelKey) }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full" :class="status.loggedIn ? 'bg-success' : 'bg-base-300'" />
        <span
          class="text-sm"
          :class="status.loggedIn ? 'text-base-content' : 'text-base-content/70'"
        >
          {{
            status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.authStatusLoggedOut')
          }}
        </span>
        <span v-if="lastLoginText" class="text-xs text-base-content/50">
          · {{ $t('settings.authLastLogin') }} {{ lastLoginText }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="settings.youtube.method === 'electron'">
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="isBusy"
            @click="doLogin"
          >
            {{ $t('settings.loginWithGoogle') }}
          </button>
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :disabled="isBusy || !status.loggedIn"
            @click="doLogout"
          >
            {{ $t('settings.logout') }}
          </button>
        </template>

        <template v-else-if="settings.youtube.method === 'manual'">
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="isBusy"
            @click="doImport"
          >
            {{ $t('settings.importCookies') }}
          </button>
          <button
            v-if="status.cookiesPath"
            class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="doExport"
          >
            {{ $t('settings.exportCookies') }}
          </button>
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :disabled="isBusy || !status.loggedIn"
            @click="doLogout"
          >
            {{ $t('settings.logout') }}
          </button>
        </template>

        <template v-else-if="settings.youtube.method === 'browser'">
          <select
            class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
            :value="settings.youtube.cookiesBrowser"
            @change="onBrowserChange"
          >
            <option v-for="b in browsers" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
          <span class="text-xs text-base-content/50">{{ $t('settings.authBrowserHint') }}</span>
        </template>
      </div>

      <p v-if="errorMsg" class="text-xs text-red-400">{{ errorMsg }}</p>
      <p v-if="settings.youtube.method !== 'none'" class="text-[11px] text-warning">
        {{ $t('settings.cookiesSecurityHint') }}
      </p>
    </SettingsCard>
  </SettingsPanel>
</template>
