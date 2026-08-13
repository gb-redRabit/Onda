<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import { FolderOpen } from '@lucide/vue';
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

async function pickDownloadPath() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) settings.updateDownload({ defaultPath: paths[0] });
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
          class="px-4 py-2 rounded-xl text-sm border transition-colors"
          :class="
            settings.youtube.method === m.value
              ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="setMethod(m.value)"
        >
          {{ $t(m.labelKey) }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="status.loggedIn ? 'bg-green-base' : 'bg-border-subtle'"
        />
        <span class="text-sm" :class="status.loggedIn ? 'text-fg-base' : 'text-fg-muted'">
          {{
            status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.authStatusLoggedOut')
          }}
        </span>
        <span v-if="lastLoginText" class="text-xs text-fg-faint">
          · {{ $t('settings.authLastLogin') }} {{ lastLoginText }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="settings.youtube.method === 'electron'">
          <button
            class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            :disabled="isBusy"
            @click="doLogin"
          >
            {{ $t('settings.loginWithGoogle') }}
          </button>
          <button
            class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
            :disabled="isBusy || !status.loggedIn"
            @click="doLogout"
          >
            {{ $t('settings.logout') }}
          </button>
        </template>

        <template v-else-if="settings.youtube.method === 'manual'">
          <button
            class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            :disabled="isBusy"
            @click="doImport"
          >
            {{ $t('settings.importCookies') }}
          </button>
          <button
            v-if="status.cookiesPath"
            class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors"
            @click="doExport"
          >
            {{ $t('settings.exportCookies') }}
          </button>
          <button
            class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
            :disabled="isBusy || !status.loggedIn"
            @click="doLogout"
          >
            {{ $t('settings.logout') }}
          </button>
        </template>

        <template v-else-if="settings.youtube.method === 'browser'">
          <select
            class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
            :value="settings.youtube.cookiesBrowser"
            @change="onBrowserChange"
          >
            <option v-for="b in browsers" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
          <span class="text-xs text-fg-faint">{{ $t('settings.authBrowserHint') }}</span>
        </template>
      </div>

      <p v-if="errorMsg" class="text-xs text-red-400">{{ errorMsg }}</p>
      <p v-if="settings.youtube.method !== 'none'" class="text-[11px] text-amber-base">
        {{ $t('settings.cookiesSecurityHint') }}
      </p>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.downloadPath')"
        :description="$t('settings.downloadPathDesc')"
      />
      <div class="flex items-center gap-2">
        <input
          :value="settings.download.defaultPath"
          readonly
          class="flex-1 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none transition-all"
          :placeholder="$t('settings.downloadPathPlaceholder')"
        />
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors shrink-0"
          @click="pickDownloadPath"
        >
          <FolderOpen :size="14" />
          {{ $t('settings.chooseFolder') }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.maxConcurrent')} ${settings.download.maxConcurrent}`"
      />
      <input
        type="range"
        min="1"
        max="10"
        :value="settings.download.maxConcurrent"
        class="w-full"
        @input="
          settings.updateDownload({
            maxConcurrent: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </SettingsCard>

    <SettingsCard>
      <SettingsRow :label="$t('settings.hashFiles')" :description="$t('settings.hashFilesDesc')">
        <SettingsToggle
          :model-value="settings.download.hashFiles"
          @update:model-value="settings.updateDownload({ hashFiles: $event })"
        />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard>
      <SettingsRow
        :label="$t('settings.autoDownloadSub')"
        :description="$t('settings.autoDownloadSubDesc')"
      >
        <SettingsToggle
          :model-value="settings.download.autoDownloadSubscriptions"
          @update:model-value="settings.updateDownload({ autoDownloadSubscriptions: $event })"
        />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard>
      <SettingsRow
        :label="$t('settings.nightSchedule')"
        :description="$t('settings.nightScheduleDesc')"
      >
        <SettingsToggle
          :model-value="settings.download.nightScheduleEnabled"
          @update:model-value="settings.updateDownload({ nightScheduleEnabled: $event })"
        />
      </SettingsRow>
      <div v-if="settings.download.nightScheduleEnabled" class="mt-3 flex items-center gap-2">
        <input
          type="number"
          min="0"
          max="23"
          :value="settings.download.nightScheduleStart"
          class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm w-20 focus:border-accent-base focus:outline-none"
          @change="
            settings.updateDownload({
              nightScheduleStart: parseInt(($event.target as HTMLInputElement).value) || 0
            })
          "
        />
        <span class="text-xs text-fg-faint">—</span>
        <input
          type="number"
          min="0"
          max="23"
          :value="settings.download.nightScheduleEnd"
          class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm w-20 focus:border-accent-base focus:outline-none"
          @change="
            settings.updateDownload({
              nightScheduleEnd: parseInt(($event.target as HTMLInputElement).value) || 0
            })
          "
        />
        <span class="text-xs text-fg-faint">{{ $t('settings.nightScheduleHours') }}</span>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.autoAddDownloadFolder')"
        :description="$t('settings.autoAddDownloadFolderDesc')"
      >
        <SettingsToggle
          :model-value="settings.download.autoAddDownloadFolder"
          @update:model-value="settings.updateDownload({ autoAddDownloadFolder: $event })"
        />
      </SettingsRow>
    </SettingsCard>
  </SettingsPanel>
</template>
