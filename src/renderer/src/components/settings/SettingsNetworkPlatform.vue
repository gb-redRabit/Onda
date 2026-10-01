<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import type { YoutubeAuthMethod } from '@renderer/types/settings';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
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

function updateProxyYt(patch: Partial<typeof settings.network.proxyYoutube>) {
  settings.updateNetwork({ proxyYoutube: { ...settings.network.proxyYoutube, ...patch } });
}
function updateProxySc(patch: Partial<typeof settings.network.proxySoundcloud>) {
  settings.updateNetwork({ proxySoundcloud: { ...settings.network.proxySoundcloud, ...patch } });
}
</script>
<template>
  <SettingsGroup
    :title="$t('settings.googleAccount')"
    :description="$t('settings.googleAccountDesc')"
  >
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <button
        v-for="m in methods"
        :key="m.value"
        class="fx-noise px-4 py-2 fx-depth rounded-field text-sm border transition-colors"
        :class="
          settings.youtube.method === m.value
            ? 'border-primary bg-primary/10 text-primary font-medium'
            : 'border-base-300 bg-base-100 text-base-content/70 hover:bg-base-content/10'
        "
        @click="setMethod(m.value)"
      >
        {{ $t(m.labelKey) }}
      </button>
    </div>

    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full" :class="status.loggedIn ? 'bg-success' : 'bg-base-300'" />
      <span class="text-sm" :class="status.loggedIn ? 'text-base-content' : 'text-base-content/70'">
        {{
          status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.authStatusLoggedOut')
        }}
      </span>
      <span v-if="lastLoginText" class="text-xs text-base-content/50">
        Â· {{ $t('settings.authLastLogin') }} {{ lastLoginText }}
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
          class="px-3 py-2 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          :value="settings.youtube.cookiesBrowser"
          @change="onBrowserChange"
        >
          <option v-for="b in browsers" :key="b.value" :value="b.value">{{ b.label }}</option>
        </select>
        <span class="text-xs text-base-content/50">{{ $t('settings.authBrowserHint') }}</span>
      </template>
    </div>

    <p v-if="errorMsg" class="text-xs text-error">{{ errorMsg }}</p>
    <p v-if="settings.youtube.method !== 'none'" class="text-[11px] text-warning">
      {{ $t('settings.cookiesSecurityHint') }}
    </p>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.qualityPerPlatform')"
      :description="$t('settings.qualityPerPlatformDesc')"
    >
      <SettingsToggle
        :model-value="!!settings.network.defaultQualityPerPlatform"
        @update:model-value="settings.updateNetwork({ defaultQualityPerPlatform: $event })"
      />
    </SettingsRow>
    <template v-if="settings.network.defaultQualityPerPlatform">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <label class="block text-xs text-base-content/50"
          >YouTube<select
            :value="settings.network.youtubeQuality || 'best'"
            class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm"
            @change="
              settings.updateNetwork({
                youtubeQuality: ($event.target as HTMLSelectElement).value
              })
            "
          >
            <option value="best">{{ $t('settings.audioQuality.best') }}</option>
            <option value="high">{{ $t('settings.audioQuality.high') }}</option>
            <option value="medium">{{ $t('settings.audioQuality.medium') }}</option>
            <option value="low">{{ $t('settings.audioQuality.low') }}</option>
          </select></label
        >
        <label class="block text-xs text-base-content/50"
          >SoundCloud<select
            :value="settings.network.soundcloudQuality || 'best'"
            class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm"
            @change="
              settings.updateNetwork({
                soundcloudQuality: ($event.target as HTMLSelectElement).value
              })
            "
          >
            <option value="best">{{ $t('settings.audioQuality.best') }}</option>
            <option value="high">{{ $t('settings.audioQuality.high') }}</option>
            <option value="medium">{{ $t('settings.audioQuality.medium') }}</option>
            <option value="low">{{ $t('settings.audioQuality.low') }}</option>
          </select></label
        >
      </div>
    </template>
  </SettingsGroup>
  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.proxyPerPlatform')"
      :description="$t('settings.proxyPerPlatformDesc')"
      ><SettingsToggle
        :model-value="!!settings.network.proxyPerPlatform"
        @update:model-value="settings.updateNetwork({ proxyPerPlatform: $event })"
    /></SettingsRow>
    <template v-if="settings.network.proxyPerPlatform">
      <div class="mt-3 p-3 rounded-box border border-base-300 bg-base-200/30">
        <div class="text-xs font-semibold mb-2">
          {{ $t('settings.proxyFor', { platform: 'YouTube' }) }}
        </div>
        <SettingsRow :label="$t('settings.enableProxy')"
          ><SettingsToggle
            :model-value="settings.network.proxyYoutube.enabled"
            @update:model-value="updateProxyYt({ enabled: $event })"
        /></SettingsRow>
        <template v-if="settings.network.proxyYoutube.enabled"
          ><div class="grid grid-cols-2 gap-2 mt-2">
            <input
              :value="settings.network.proxyYoutube.host"
              placeholder="host"
              class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm"
              @input="updateProxyYt({ host: ($event.target as HTMLInputElement).value })"
            /><input
              type="number"
              :value="settings.network.proxyYoutube.port"
              class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm"
              @input="
                updateProxyYt({
                  port: parseInt(($event.target as HTMLInputElement).value) || 8080
                })
              "
            /></div
        ></template>
      </div>
      <div class="mt-3 p-3 rounded-box border border-base-300 bg-base-200/30">
        <div class="text-xs font-semibold mb-2">
          {{ $t('settings.proxyFor', { platform: 'SoundCloud' }) }}
        </div>
        <SettingsRow :label="$t('settings.enableProxy')"
          ><SettingsToggle
            :model-value="settings.network.proxySoundcloud.enabled"
            @update:model-value="updateProxySc({ enabled: $event })"
        /></SettingsRow>
        <template v-if="settings.network.proxySoundcloud.enabled"
          ><div class="grid grid-cols-2 gap-2 mt-2">
            <input
              :value="settings.network.proxySoundcloud.host"
              placeholder="host"
              class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm"
              @input="updateProxySc({ host: ($event.target as HTMLInputElement).value })"
            /><input
              type="number"
              :value="settings.network.proxySoundcloud.port"
              class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm"
              @input="
                updateProxySc({
                  port: parseInt(($event.target as HTMLInputElement).value) || 8080
                })
              "
            /></div
        ></template>
      </div>
    </template>
  </SettingsGroup>
</template>
