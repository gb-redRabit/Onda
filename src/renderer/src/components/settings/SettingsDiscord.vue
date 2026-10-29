<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { DiscordStatus } from '@shared/types/discord';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const CLIENT_ID_RE = /^\d{10,25}$/;
const STATUS_POLL_MS = 5000;
const DEV_PORTAL_URL = 'https://discord.com/developers/applications';

const clientId = ref(settings.general.discordClientId);
const status = ref<DiscordStatus | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const clientIdValid = computed(() => CLIENT_ID_RE.test(clientId.value.trim()));
const savedClientIdValid = computed(() => CLIENT_ID_RE.test(settings.general.discordClientId));

watch(
  () => settings.general.discordClientId,
  (value) => {
    clientId.value = value;
  }
);

function saveClientId(): void {
  const value = clientId.value.trim();
  if (value === settings.general.discordClientId) return;
  settings.updateGeneral({ discordClientId: value });
}

function setPresence(enabled: boolean): void {
  saveClientId();
  settings.updateGeneral({ discordRichPresence: enabled });
}

async function refreshStatus(): Promise<void> {
  try {
    status.value = (await window.api?.getDiscordStatus()) ?? null;
  } catch {
    status.value = null;
  }
}

const statusKind = computed<'off' | 'invalid' | 'connected' | 'waiting'>(() => {
  if (!settings.general.discordRichPresence) return 'off';
  if (!savedClientIdValid.value) return 'invalid';
  return status.value?.connected ? 'connected' : 'waiting';
});

const statusLabel = computed(() => t(`settings.discordStatus.${statusKind.value}`));
const statusDetail = computed(() => {
  if (statusKind.value === 'invalid') return t('settings.discordClientIdInvalid');
  return status.value?.error ?? '';
});

onMounted(() => {
  void refreshStatus();
  pollTimer = setInterval(() => void refreshStatus(), STATUS_POLL_MS);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

watch(
  () => [settings.general.discordRichPresence, settings.general.discordClientId],
  () => void refreshStatus()
);
</script>

<template>
  <SettingsGroup :title="$t('settings.discordConnection')">
    <div class="flex items-start gap-3 py-3">
      <span
        class="grid place-items-center w-8 h-8 rounded-full shrink-0"
        :class="{
          'bg-success/15 text-success': statusKind === 'connected',
          'bg-warning/15 text-warning': statusKind === 'waiting',
          'bg-error/15 text-error': statusKind === 'invalid',
          'bg-base-300/60 text-base-content/50': statusKind === 'off'
        }"
      >
        <CheckCircle2 v-if="statusKind === 'connected'" :size="17" />
        <Loader2 v-else-if="statusKind === 'waiting'" :size="17" class="animate-spin" />
        <AlertCircle v-else-if="statusKind === 'invalid'" :size="17" />
        <AlertCircle v-else :size="17" />
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-medium" data-testid="settings-discord-status">
          {{ statusLabel }}
        </p>
        <p v-if="statusDetail" class="text-[11px] text-base-content/60 mt-0.5 break-words">
          {{ statusDetail }}
        </p>
        <p v-else class="text-[11px] text-base-content/60 mt-0.5">
          {{ $t('settings.discordStatusHint') }}
        </p>
      </div>
    </div>

    <SettingsRow
      :label="$t('settings.discordRichPresence')"
      :description="$t('settings.discordRichPresenceDesc')"
      path="general.discordRichPresence"
      anchor="setting-discord-presence"
    >
      <SettingsToggle
        :model-value="settings.general.discordRichPresence"
        :disabled="!savedClientIdValid && !settings.general.discordRichPresence"
        @update:model-value="setPresence"
      />
    </SettingsRow>

    <SettingsRow
      :label="$t('settings.discordClientId')"
      :description="$t('settings.discordClientIdDesc')"
      path="general.discordClientId"
      anchor="setting-discord-client-id"
    >
      <input
        v-model="clientId"
        data-testid="settings-discord-client-id"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        :placeholder="$t('settings.discordClientIdPlaceholder')"
        class="w-56 rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary"
        :class="{ 'border-error/60': clientId.length > 0 && !clientIdValid }"
        @change="saveClientId"
        @blur="saveClientId"
      />
    </SettingsRow>

    <p class="py-2 text-xs text-base-content/50">
      {{
        clientId.length > 0 && !clientIdValid
          ? $t('settings.discordClientIdInvalid')
          : $t('settings.discordClientIdHint')
      }}
    </p>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.discordCoverSection')">
    <SettingsRow
      :label="$t('settings.discordUploadLocalCovers')"
      :description="$t('settings.discordUploadLocalCoversDesc')"
      path="general.discordUploadLocalCovers"
      anchor="setting-discord-upload-covers"
    >
      <SettingsToggle
        :model-value="settings.general.discordUploadLocalCovers"
        :disabled="!settings.general.discordRichPresence"
        @update:model-value="settings.updateGeneral({ discordUploadLocalCovers: $event })"
      />
    </SettingsRow>
    <SettingsRow
      :label="$t('settings.discordOnlineCovers')"
      :description="$t('settings.discordOnlineCoversDesc')"
      path="general.discordOnlineCovers"
      anchor="setting-discord-online-covers"
    >
      <SettingsToggle
        :model-value="settings.general.discordOnlineCovers"
        :disabled="!settings.general.discordRichPresence"
        @update:model-value="settings.updateGeneral({ discordOnlineCovers: $event })"
      />
    </SettingsRow>
    <p class="py-2 text-xs text-base-content/50">{{ $t('settings.discordCoverNote') }}</p>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.discordSetup')">
    <div class="py-3 space-y-3 text-[13px] text-base-content/80">
      <p class="text-[11px] text-base-content/60">{{ $t('settings.discordSetupIntro') }}</p>
      <ol class="space-y-2.5 list-decimal pl-5">
        <li>
          {{ $t('settings.discordStepPortal') }}
          <a
            :href="DEV_PORTAL_URL"
            target="_blank"
            rel="noreferrer"
            class="ml-1 inline-flex items-center gap-1 text-primary-text hover:underline"
          >
            {{ $t('settings.discordOpenPortal') }}
            <ExternalLink :size="12" />
          </a>
        </li>
        <li>{{ $t('settings.discordStepApp') }}</li>
        <li>{{ $t('settings.discordStepId') }}</li>
        <li>{{ $t('settings.discordStepIcon') }}</li>
        <li>{{ $t('settings.discordStepPrivacy') }}</li>
        <li>{{ $t('settings.discordStepPlay') }}</li>
      </ol>
    </div>
  </SettingsGroup>
</template>
