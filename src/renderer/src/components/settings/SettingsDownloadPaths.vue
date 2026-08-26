<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import { FolderOpen, Save, Trash2 } from '@lucide/vue';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import type { IpcDownloadConfig } from '@shared/types/ipc';

const settings = useSettingsStore();
const { t: _t } = useI18n();
void _t;
const { profiles, ensureLoaded: ensureProfilesLoaded, save: saveProfile, remove: removeProfile } = useDownloadProfiles();
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
  if (!id) { resetProfileForm(); return; }
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
    if (c.cover.type === 'clip') { pfClipStart.value = c.cover.clipStart ?? 0; pfClipEnd.value = c.cover.clipEnd ?? 30; pfClipFormat.value = c.cover.clipFormat ?? 'webm'; }
  }
}
function buildProfileConfig(): IpcDownloadConfig {
  const config: IpcDownloadConfig = { kind: pfKind.value, audioQuality: pfAudioQuality.value };
  if (pfKind.value === 'audio') config.format = pfFormat.value; else { config.quality = pfQuality.value; config.videoContainer = pfContainer.value; }
  if (pfCoverType.value === 'thumbnail') config.cover = { type: 'thumbnail' };
  else if (pfCoverType.value === 'frame') config.cover = { type: 'frame', frameTime: Number(pfFrameTime.value) || 0 };
  else if (pfCoverType.value === 'clip') config.cover = { type: 'clip', clipStart: Number(pfClipStart.value) || 0, clipEnd: Number(pfClipEnd.value) || 0, clipFormat: pfClipFormat.value };
  return config;
}
async function doSaveProfile() {
  const name = profileName.value.trim(); if (!name) return;
  await saveProfile(name, buildProfileConfig(), selectedProfileId.value || undefined); resetProfileForm();
}
async function doDeleteProfile() { if (!selectedProfileId.value) return; await removeProfile(selectedProfileId.value); resetProfileForm(); }
async function pickDownloadPath() { const paths = (await window.api.invoke('dialog:openFolder')) as string[]; if (paths.length > 0) settings.updateDownload({ defaultPath: paths[0] }); }
async function pickSourcesPath() { const paths = (await window.api.invoke('dialog:openFolder')) as string[]; if (paths.length > 0) settings.updateDownload({ sourcesDir: paths[0] }); }
async function pickTempDir() { const paths = (await window.api.invoke('dialog:openFolder')) as string[]; if (paths.length > 0) settings.updateDownload({ tempDir: paths[0] }); }
function onSourcesFolderChange(e: Event) { settings.updateDownload({ sourcesFolder: (e.target as HTMLInputElement).checked }); }
</script>

<template>
  <SettingsPanel :title="$t('settings.downloadSection')">
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.downloadPath')" :description="$t('settings.downloadPathDesc')" />
      <div class="flex items-center gap-2">
        <input :value="settings.download.defaultPath" readonly class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" :placeholder="$t('settings.downloadPathPlaceholder')" />
        <button class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0" @click="pickDownloadPath"><FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}</button>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.sourcesPath')" :description="$t('settings.sourcesPathDesc')" />
      <div class="flex items-center gap-2">
        <input :value="settings.download.sourcesDir" readonly class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" :placeholder="$t('settings.sourcesPathPlaceholder')" />
        <button class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0" @click="pickSourcesPath"><FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}</button>
      </div>
      <p class="text-xs text-base-content/50 mt-2">{{ $t('settings.sourcesPathHint') }}</p>
      <label class="flex items-center gap-2 mt-3 cursor-pointer"><input type="checkbox" class="accent-primary" :checked="settings.download.sourcesFolder" @change="onSourcesFolderChange" /><span class="text-sm">{{ $t('settings.sourcesFolder') }}</span></label>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.tempDir')" :description="$t('settings.tempDirDesc')" />
      <div class="flex items-center gap-2">
        <input :value="settings.download.tempDir || ''" readonly class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" :placeholder="$t('settings.tempDirPlaceholder')" />
        <button class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0" @click="pickTempDir"><FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}</button>
        <button v-if="settings.download.tempDir" class="px-3 py-2 text-xs text-base-content/50 hover:text-base-content" @click="settings.updateDownload({ tempDir: '' })">{{ $t('common.clear') }}</button>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.profilesSection')" :description="$t('settings.profilesSectionDesc')" />
      <div class="flex items-center gap-2">
        <select class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" :value="selectedProfileId" @change="onProfileSelect"><option value="">{{ $t('settings.profileNew') }}</option><option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option></select>
        <button class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 disabled:opacity-40 shrink-0" :disabled="!selectedProfileId" @click="doDeleteProfile"><Trash2 :size="14" /></button>
      </div>
      <input v-model="profileName" class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" :placeholder="$t('settings.profileNamePlaceholder')" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label class="block text-xs text-base-content/50">{{ $t('youtube.prefKind') }}<select v-model="pfKind" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option v-for="k in profileKinds" :key="k.value" :value="k.value">{{ $t(k.labelKey) }}</option></select></label>
        <label v-if="pfKind === 'audio'" class="block text-xs text-base-content/50">{{ $t('youtube.prefFormat') }}<select v-model="pfFormat" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option v-for="f in audioFormats" :key="f" :value="f">{{ f === 'best' ? $t('settings.audioNative') : f }}</option></select></label>
        <label v-if="pfKind === 'video'" class="block text-xs text-base-content/50">{{ $t('youtube.prefQuality') }}<select v-model="pfQuality" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option></select></label>
        <label v-if="pfKind === 'video'" class="block text-xs text-base-content/50">{{ $t('youtube.prefContainer') }}<select v-model="pfContainer" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option v-for="c in videoContainers" :key="c" :value="c">{{ c }}</option></select></label>
        <label v-if="pfKind !== 'video'" class="block text-xs text-base-content/50">{{ $t('settings.defaultAudioQuality') }}<select v-model="pfAudioQuality" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option v-for="q in ['best','high','medium','low'] as const" :key="q" :value="q">{{ $t('settings.audioQuality.'+q) }}</option></select></label>
        <label class="block text-xs text-base-content/50">{{ $t('settings.defaultCover') }}<select v-model="pfCoverType" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option value="thumbnail">{{ $t('settings.cover.thumbnail') }}</option><option value="none">{{ $t('settings.cover.none') }}</option><option value="frame">{{ $t('settings.cover.frame') }}</option><option value="clip">{{ $t('settings.cover.clip') }}</option></select></label>
        <label v-if="pfCoverType === 'frame'" class="block text-xs text-base-content/50">{{ $t('youtube.frameTimeLabel') }}<input v-model.number="pfFrameTime" type="number" min="0" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" /></label>
        <template v-if="pfCoverType === 'clip'">
          <label class="block text-xs text-base-content/50">{{ $t('youtube.clipStartLabel') }}<input v-model.number="pfClipStart" type="number" min="0" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" /></label>
          <label class="block text-xs text-base-content/50">{{ $t('youtube.clipEndLabel') }}<input v-model.number="pfClipEnd" type="number" min="1" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" /></label>
          <label class="block text-xs text-base-content/50">{{ $t('youtube.clipFormatLabel') }}<select v-model="pfClipFormat" class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"><option value="webm">.webm</option><option value="mp4">.mp4</option></select></label>
        </template>
      </div>
      <button class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 disabled:opacity-50 w-fit" :disabled="!profileName.trim()" @click="doSaveProfile"><Save :size="14" />{{ selectedProfileId ? $t('settings.profileSaveUpdate') : $t('settings.profileSaveCreate') }}</button>
    </SettingsCard>
  </SettingsPanel>
</template>
