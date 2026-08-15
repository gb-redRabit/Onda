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
import { FolderOpen, Save, Trash2 } from '@lucide/vue';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import type { IpcDownloadConfig } from '@shared/types/ipc';
import type { YoutubeAuthMethod } from '@renderer/types/settings';

const settings = useSettingsStore();
const { t } = useI18n();
const { status, refresh, ensureLoaded } = useYoutubeAuth();
ensureLoaded();

const { profiles, ensureLoaded: ensureProfilesLoaded, save: saveProfile, remove: removeProfile } =
  useDownloadProfiles();
ensureProfilesLoaded();

const selectedProfileId = ref('');
const profileName = ref('');
const pfKind = ref<'audio' | 'video'>(settings.download.defaultKind);
const pfFormat = ref<string>(settings.download.defaultAudioFormat);
const pfQuality = ref<string>(settings.download.defaultVideoQuality);
const pfContainer = ref<'mp4' | 'mkv' | 'webm'>(settings.download.defaultVideoContainer);
const pfAudioQuality = ref<string>(settings.download.defaultAudioQuality);
const pfCoverType = ref<'thumbnail' | 'none' | 'frame' | 'clip'>(settings.download.defaultCover);
const pfFrameTime = ref(30);
const pfClipStart = ref(0);
const pfClipEnd = ref(30);
const pfClipFormat = ref<'webm' | 'mp4'>('webm');

const audioFormats = AUDIO_FORMATS;
const videoQualities = VIDEO_QUALITIES;
const videoContainers = VIDEO_CONTAINERS;
const profileKinds: Array<{ value: 'audio' | 'video'; labelKey: string }> = [
  { value: 'audio', labelKey: 'youtube.prefAudio' },
  { value: 'video', labelKey: 'youtube.prefVideo' }
];

function resetProfileForm() {
  selectedProfileId.value = '';
  profileName.value = '';
  pfKind.value = settings.download.defaultKind;
  pfFormat.value = settings.download.defaultAudioFormat;
  pfQuality.value = settings.download.defaultVideoQuality;
  pfContainer.value = settings.download.defaultVideoContainer;
  pfAudioQuality.value = settings.download.defaultAudioQuality;
  pfCoverType.value = settings.download.defaultCover;
  pfFrameTime.value = 30;
  pfClipStart.value = 0;
  pfClipEnd.value = 30;
  pfClipFormat.value = 'webm';
}

function onProfileSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  selectedProfileId.value = id;
  if (!id) {
    resetProfileForm();
    return;
  }
  const p = profiles.value.find((x) => x.id === id);
  if (!p) return;
  const c = p.config;
  profileName.value = p.name;
  if (c.kind) pfKind.value = c.kind;
  if (c.format) pfFormat.value = c.format;
  if (c.quality) pfQuality.value = c.quality;
  if (c.videoContainer) pfContainer.value = c.videoContainer;
  if (c.audioQuality) pfAudioQuality.value = c.audioQuality;
  if (c.cover) {
    pfCoverType.value = c.cover.type === 'custom' ? 'thumbnail' : c.cover.type;
    if (c.cover.type === 'frame') pfFrameTime.value = c.cover.frameTime ?? 30;
    if (c.cover.type === 'clip') {
      pfClipStart.value = c.cover.clipStart ?? 0;
      pfClipEnd.value = c.cover.clipEnd ?? 30;
      pfClipFormat.value = c.cover.clipFormat ?? 'webm';
    }
  }
}

function buildProfileConfig(): IpcDownloadConfig {
  const config: IpcDownloadConfig = {
    kind: pfKind.value,
    audioQuality: pfAudioQuality.value
  };
  if (pfKind.value === 'audio') config.format = pfFormat.value;
  else {
    config.quality = pfQuality.value;
    config.videoContainer = pfContainer.value;
  }
  if (pfCoverType.value === 'thumbnail') config.cover = { type: 'thumbnail' };
  else if (pfCoverType.value === 'frame') {
    config.cover = { type: 'frame', frameTime: Number(pfFrameTime.value) || 0 };
  } else if (pfCoverType.value === 'clip') {
    config.cover = {
      type: 'clip',
      clipStart: Number(pfClipStart.value) || 0,
      clipEnd: Number(pfClipEnd.value) || 0,
      clipFormat: pfClipFormat.value
    };
  }
  return config;
}

async function doSaveProfile() {
  const name = profileName.value.trim();
  if (!name) return;
  await saveProfile(name, buildProfileConfig(), selectedProfileId.value || undefined);
  resetProfileForm();
}

async function doDeleteProfile() {
  if (!selectedProfileId.value) return;
  await removeProfile(selectedProfileId.value);
  resetProfileForm();
}

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
        :title="$t('settings.profilesSection')"
        :description="$t('settings.profilesSectionDesc')"
      />
      <div class="flex items-center gap-2">
        <select
          class="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          :value="selectedProfileId"
          @change="onProfileSelect"
        >
          <option value="">{{ $t('settings.profileNew') }}</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-40 shrink-0"
          :disabled="!selectedProfileId"
          :title="$t('settings.profileDelete')"
          @click="doDeleteProfile"
        >
          <Trash2 :size="14" />
        </button>
      </div>

      <input
        v-model="profileName"
        class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
        :placeholder="$t('settings.profileNamePlaceholder')"
      />

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label class="block text-xs text-fg-faint">
          {{ $t('youtube.prefKind') }}
          <select
            v-model="pfKind"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option v-for="k in profileKinds" :key="k.value" :value="k.value">
              {{ $t(k.labelKey) }}
            </option>
          </select>
        </label>
        <label v-if="pfKind === 'audio'" class="block text-xs text-fg-faint">
          {{ $t('youtube.prefFormat') }}
          <select
            v-model="pfFormat"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option v-for="f in audioFormats" :key="f" :value="f">
              {{ f === 'best' ? $t('settings.audioNative') : f }}
            </option>
          </select>
        </label>
        <label v-if="pfKind === 'video'" class="block text-xs text-fg-faint">
          {{ $t('youtube.prefQuality') }}
          <select
            v-model="pfQuality"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
          </select>
        </label>
        <label v-if="pfKind === 'video'" class="block text-xs text-fg-faint">
          {{ $t('youtube.prefContainer') }}
          <select
            v-model="pfContainer"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option v-for="c in videoContainers" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label v-if="pfKind !== 'video'" class="block text-xs text-fg-faint">
          {{ $t('settings.defaultAudioQuality') }}
          <select
            v-model="pfAudioQuality"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option v-for="q in ['best', 'high', 'medium', 'low'] as const" :key="q" :value="q">
              {{ $t('settings.audioQuality.' + q) }}
            </option>
          </select>
        </label>
        <label class="block text-xs text-fg-faint">
          {{ $t('settings.defaultCover') }}
          <select
            v-model="pfCoverType"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          >
            <option value="thumbnail">{{ $t('settings.cover.thumbnail') }}</option>
            <option value="none">{{ $t('settings.cover.none') }}</option>
            <option value="frame">{{ $t('settings.cover.frame') }}</option>
            <option value="clip">{{ $t('settings.cover.clip') }}</option>
          </select>
        </label>
        <label v-if="pfCoverType === 'frame'" class="block text-xs text-fg-faint">
          {{ $t('youtube.frameTimeLabel') }}
          <input
            v-model.number="pfFrameTime"
            type="number"
            min="0"
            class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
          />
        </label>
        <template v-if="pfCoverType === 'clip'">
          <label class="block text-xs text-fg-faint">
            {{ $t('youtube.clipStartLabel') }}
            <input
              v-model.number="pfClipStart"
              type="number"
              min="0"
              class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            />
          </label>
          <label class="block text-xs text-fg-faint">
            {{ $t('youtube.clipEndLabel') }}
            <input
              v-model.number="pfClipEnd"
              type="number"
              min="1"
              class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            />
          </label>
          <label class="block text-xs text-fg-faint">
            {{ $t('youtube.clipFormatLabel') }}
            <select
              v-model="pfClipFormat"
              class="mt-1 w-full px-2 py-2 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            >
              <option value="webm">.webm</option>
              <option value="mp4">.mp4</option>
            </select>
          </label>
        </template>
      </div>

      <button
        class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 w-fit"
        :disabled="!profileName.trim()"
        @click="doSaveProfile"
      >
        <Save :size="14" />
        {{ selectedProfileId ? $t('settings.profileSaveUpdate') : $t('settings.profileSaveCreate') }}
      </button>
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
