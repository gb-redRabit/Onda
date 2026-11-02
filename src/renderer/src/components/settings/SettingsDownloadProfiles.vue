<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { Save, Trash2 } from '@lucide/vue';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import type { IpcDownloadConfig } from '@shared/types/ipc';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import Button from '@renderer/components/ui/Button.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import Input from '@renderer/components/ui/Input.vue';
import NumberField from '@renderer/components/ui/NumberField.vue';
import Select from '@renderer/components/ui/Select.vue';

const { t } = useI18n();
const prompt = usePromptDialog();
const settings = useSettingsStore();
const {
  profiles,
  ensureLoaded: ensureProfilesLoaded,
  save: saveProfile,
  remove: removeProfile
} = useDownloadProfiles();
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

function onProfileSelect(value: string | number | undefined) {
  const id = String(value ?? '');
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
  const config: IpcDownloadConfig = { kind: pfKind.value, audioQuality: pfAudioQuality.value };
  if (pfKind.value === 'audio') config.format = pfFormat.value;
  else {
    config.quality = pfQuality.value;
    config.videoContainer = pfContainer.value;
  }
  if (pfCoverType.value === 'thumbnail') config.cover = { type: 'thumbnail' };
  else if (pfCoverType.value === 'frame')
    config.cover = { type: 'frame', frameTime: Number(pfFrameTime.value) || 0 };
  else if (pfCoverType.value === 'clip')
    config.cover = {
      type: 'clip',
      clipStart: Number(pfClipStart.value) || 0,
      clipEnd: Number(pfClipEnd.value) || 0,
      clipFormat: pfClipFormat.value
    };
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
  const name = profiles.value.find((p) => p.id === selectedProfileId.value)?.name || '';
  const ok = await prompt.showConfirm(t('settings.profileDeleteConfirm', { name }));
  if (!ok) return;
  await removeProfile(selectedProfileId.value);
  resetProfileForm();
}
</script>

<template>
  <SettingsGroup
    :title="$t('settings.profilesSection')"
    :description="$t('settings.profilesSectionDesc')"
  >
    <div class="flex items-center gap-2">
      <Select
        :model-value="selectedProfileId"
        class="min-w-0 flex-1"
        :aria-label="$t('settings.profilesSection')"
        @update:model-value="onProfileSelect"
      >
        <option value="">{{ $t('settings.profileNew') }}</option>
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
      </Select>
      <IconButton
        :icon="Trash2"
        :label="$t('settings.profileDelete')"
        variant="danger"
        class="shrink-0 border border-hairline"
        :disabled="!selectedProfileId"
        @click="doDeleteProfile"
      />
    </div>

    <Input
      v-model="profileName"
      :aria-label="$t('settings.profileNamePlaceholder')"
      :placeholder="$t('settings.profileNamePlaceholder')"
    />

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="block text-xs text-base-content/50">
        {{ $t('youtube.prefKind') }}
        <Select v-model="pfKind" size="sm" class="mt-1">
          <option v-for="k in profileKinds" :key="k.value" :value="k.value">
            {{ $t(k.labelKey) }}
          </option>
        </Select>
      </label>

      <label v-if="pfKind === 'audio'" class="block text-xs text-base-content/50">
        {{ $t('youtube.prefFormat') }}
        <Select v-model="pfFormat" size="sm" class="mt-1">
          <option v-for="f in audioFormats" :key="f" :value="f">
            {{ f === 'best' ? $t('settings.audioNative') : f }}
          </option>
        </Select>
      </label>

      <label v-if="pfKind === 'video'" class="block text-xs text-base-content/50">
        {{ $t('youtube.prefQuality') }}
        <Select v-model="pfQuality" size="sm" class="mt-1">
          <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
        </Select>
      </label>

      <label v-if="pfKind === 'video'" class="block text-xs text-base-content/50">
        {{ $t('youtube.prefContainer') }}
        <Select v-model="pfContainer" size="sm" class="mt-1">
          <option v-for="c in videoContainers" :key="c" :value="c">{{ c }}</option>
        </Select>
      </label>

      <label v-if="pfKind !== 'video'" class="block text-xs text-base-content/50">
        {{ $t('settings.defaultAudioQuality') }}
        <Select v-model="pfAudioQuality" size="sm" class="mt-1">
          <option v-for="q in ['best', 'high', 'medium', 'low'] as const" :key="q" :value="q">
            {{ $t('settings.audioQuality.' + q) }}
          </option>
        </Select>
      </label>

      <label class="block text-xs text-base-content/50">
        {{ $t('settings.defaultCover') }}
        <Select v-model="pfCoverType" size="sm" class="mt-1">
          <option value="thumbnail">{{ $t('settings.cover.thumbnail') }}</option>
          <option value="none">{{ $t('settings.cover.none') }}</option>
          <option value="frame">{{ $t('settings.cover.frame') }}</option>
          <option value="clip">{{ $t('settings.cover.clip') }}</option>
        </Select>
      </label>

      <label v-if="pfCoverType === 'frame'" class="block text-xs text-base-content/50">
        {{ $t('youtube.frameTimeLabel') }}
        <NumberField
          v-model="pfFrameTime"
          size="sm"
          class="mt-1"
          :label="$t('youtube.frameTimeLabel')"
          :min="0"
          unit="s"
        />
      </label>

      <template v-if="pfCoverType === 'clip'">
        <label class="block text-xs text-base-content/50">
          {{ $t('youtube.clipStartLabel') }}
          <NumberField
            v-model="pfClipStart"
            size="sm"
            class="mt-1"
            :label="$t('youtube.clipStartLabel')"
            :min="0"
            unit="s"
          />
        </label>
        <label class="block text-xs text-base-content/50">
          {{ $t('youtube.clipEndLabel') }}
          <NumberField
            v-model="pfClipEnd"
            size="sm"
            class="mt-1"
            :label="$t('youtube.clipEndLabel')"
            :min="1"
            unit="s"
          />
        </label>
        <label class="block text-xs text-base-content/50">
          {{ $t('youtube.clipFormatLabel') }}
          <Select v-model="pfClipFormat" size="sm" class="mt-1">
            <option value="webm">.webm</option>
            <option value="mp4">.mp4</option>
          </Select>
        </label>
      </template>
    </div>

    <Button
      variant="solid"
      class="w-fit"
      data-testid="settings-profile-save"
      :disabled="!profileName.trim()"
      @click="doSaveProfile"
    >
      <template #leading><Save :size="14" /></template>
      {{ selectedProfileId ? $t('settings.profileSaveUpdate') : $t('settings.profileSaveCreate') }}
    </Button>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm()"
      @cancel="prompt.promptCancel()"
    />
  </SettingsGroup>
</template>
