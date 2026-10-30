<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import type {
  ScrobblingAuthCompleteResult,
  ScrobblingAuthResult,
  ScrobblingStatus,
  ScrobblingTestResult
} from '@shared/types/ipc/channels-scrobbling';

const IDS = {
  lastfmApiKey: 'scrobble:lastfm-api-key',
  lastfmApiSecret: 'scrobble:lastfm-api-secret',
  lastfmSession: 'scrobble:lastfm-session',
  listenbrainzToken: 'scrobble:listenbrainz-token'
} as const;

const settings = useSettingsStore();
const { t } = useI18n();
const status = ref<ScrobblingStatus | null>(null);
const busy = ref<string | null>(null);
const message = ref('');
const error = ref('');

const lastfmApiKey = ref('');
const lastfmApiSecret = ref('');
const listenbrainzToken = ref('');

const lastfmKeyPreview = computed(() => previewOf(IDS.lastfmApiKey));
const lastfmSecretPreview = computed(() => previewOf(IDS.lastfmApiSecret));
const listenbrainzPreview = computed(() => previewOf(IDS.listenbrainzToken));

function entryOf(id: string) {
  return settings.apiKeys.keys.find((key) => key.id === id);
}

function previewOf(id: string): string {
  return entryOf(id)?.preview || (entryOf(id)?.key ? '••••' : '');
}

/**
 * Zapisuje sekret do wpisu API keys o stałym id. Puste `key` zachowuje poprzednią
 * wartość (renderer nie zna sekretów po `settings:get`).
 */
function upsert(
  id: string,
  service: string,
  name: string,
  key: string,
  isActive: boolean,
  values?: Record<string, string | number | boolean>
): void {
  const keys = [...settings.apiKeys.keys];
  const index = keys.findIndex((entry) => entry.id === id);
  const preview = key ? `${key.slice(0, 4)}` : undefined;
  if (index >= 0) {
    const existing = keys[index];
    keys[index] = {
      ...existing,
      ...(key ? { key, ...(preview ? { preview } : {}) } : {}),
      isActive,
      ...(values ? { values: { ...(existing.values || {}), ...values } } : {})
    };
  } else if (key) {
    keys.push({
      id,
      name,
      service,
      key,
      isActive,
      ...(preview ? { preview } : {}),
      ...(values ? { values } : {})
    });
  } else {
    return;
  }
  settings.apiKeys.keys = keys;
  settings.saveImmediate?.();
}

function setEnabled(id: string, enabled: boolean): void {
  const entry = entryOf(id);
  if (!entry) return;
  upsert(id, entry.service, entry.name, '', enabled, entry.values);
  void refresh();
}

function waitForPersist(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 120));
}

async function refresh(): Promise<void> {
  try {
    status.value = await window.api.invoke('scrobbling:status');
  } catch {
    status.value = null;
  }
}

function saveLastfmCredentials(): boolean {
  const key = lastfmApiKey.value.trim();
  const secret = lastfmApiSecret.value.trim();
  if (key) upsert(IDS.lastfmApiKey, 'lastfm', 'Last.fm API key', key, false);
  if (secret) upsert(IDS.lastfmApiSecret, 'lastfm', 'Last.fm API secret', secret, false);
  lastfmApiKey.value = '';
  lastfmApiSecret.value = '';
  return !!(key || secret);
}

async function testLastfm(): Promise<void> {
  error.value = '';
  message.value = '';
  saveLastfmCredentials();
  await waitForPersist();
  busy.value = 'lastfm-test';
  try {
    const res = (await window.api.invoke('scrobbling:test', 'lastfm')) as ScrobblingTestResult;
    if (res.ok) message.value = `Last.fm: ${res.username || 'OK'}`;
    else error.value = res.error || 'Last.fm test failed';
  } finally {
    busy.value = null;
    await refresh();
  }
}

async function connectLastfm(): Promise<void> {
  error.value = '';
  message.value = '';
  saveLastfmCredentials();
  await waitForPersist();
  busy.value = 'lastfm-auth';
  try {
    const started = (await window.api.invoke('scrobbling:lastfmAuth')) as ScrobblingAuthResult;
    if (!started.ok) {
      error.value = started.error || 'Last.fm authorization failed';
      return;
    }
    message.value = t('settings.scrobblingAuthorizeInBrowser');
    for (let attempt = 0; attempt < 36; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const done = (await window.api.invoke(
        'scrobbling:lastfmAuthComplete'
      )) as ScrobblingAuthCompleteResult;
      if (done.ok && done.sessionKey) {
        upsert(IDS.lastfmSession, 'lastfm', 'Last.fm session', done.sessionKey, true, {
          ...(done.username ? { username: done.username } : {})
        });
        await waitForPersist();
        message.value = t('settings.lastfmConnectedAs', {
          user: done.username || 'Last.fm'
        });
        break;
      }
      if (attempt === 35) error.value = done.error || t('settings.lastfmConnectFailed');
    }
  } finally {
    busy.value = null;
    await refresh();
  }
}

async function saveAndTestListenbrainz(): Promise<void> {
  error.value = '';
  message.value = '';
  const token = listenbrainzToken.value.trim();
  if (token) upsert(IDS.listenbrainzToken, 'listenbrainz', 'ListenBrainz token', token, false);
  listenbrainzToken.value = '';
  await waitForPersist();
  busy.value = 'listenbrainz-test';
  try {
    const res = (await window.api.invoke(
      'scrobbling:test',
      'listenbrainz'
    )) as ScrobblingTestResult;
    if (res.ok) {
      upsert(IDS.listenbrainzToken, 'listenbrainz', 'ListenBrainz token', '', true, {
        ...(res.username ? { username: res.username } : {})
      });
      message.value = `ListenBrainz: ${res.username || 'OK'}`;
    } else {
      error.value = res.error || 'ListenBrainz test failed';
    }
  } finally {
    busy.value = null;
    await refresh();
  }
}

onMounted(refresh);
</script>

<template>
  <SettingsGroup
    :title="$t('settings.scrobblingTitle')"
    :description="$t('settings.scrobblingDesc')"
  >
    <div data-testid="settings-scrobbling" class="space-y-4">
      <div class="rounded-field border border-base-300 p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">{{ $t('settings.lastfm') }}</p>
            <p class="text-2xs text-base-content/50">
              {{
                status?.lastfm.username
                  ? $t('settings.scrobblingConnectedAs', { user: status.lastfm.username })
                  : $t('settings.scrobblingNotConnected')
              }}
            </p>
          </div>
          <SettingsToggle
            :model-value="!!status?.lastfm.enabled"
            :disabled="!status?.lastfm.session"
            :label="$t('settings.lastfm')"
            @update:model-value="setEnabled(IDS.lastfmSession, $event)"
          />
        </div>

        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            v-model="lastfmApiKey"
            data-testid="scrobbling-lastfm-api-key"
            type="password"
            autocomplete="off"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
            :placeholder="lastfmKeyPreview || $t('settings.lastfmApiKey')"
            :aria-label="$t('settings.lastfmApiKey')"
          />
          <input
            v-model="lastfmApiSecret"
            data-testid="scrobbling-lastfm-api-secret"
            type="password"
            autocomplete="off"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
            :placeholder="lastfmSecretPreview || $t('settings.lastfmApiSecret')"
            :aria-label="$t('settings.lastfmApiSecret')"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            data-testid="scrobbling-lastfm-connect"
            class="px-3 py-1.5 rounded-field bg-primary text-primary-content text-xs fx-depth"
            :disabled="busy !== null"
            @click="connectLastfm"
          >
            {{
              busy === 'lastfm-auth'
                ? $t('settings.scrobblingConnecting')
                : $t('settings.lastfmConnect')
            }}
          </button>
          <button
            data-testid="scrobbling-lastfm-test"
            class="px-3 py-1.5 rounded-field border border-base-300 text-xs"
            :disabled="busy !== null"
            @click="testLastfm"
          >
            {{ $t('settings.scrobblingTest') }}
          </button>
        </div>
      </div>

      <div class="rounded-field border border-base-300 p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">{{ $t('settings.listenbrainz') }}</p>
            <p class="text-2xs text-base-content/50">
              {{
                status?.listenbrainz.username
                  ? $t('settings.scrobblingConnectedAs', { user: status.listenbrainz.username })
                  : $t('settings.scrobblingNotConnected')
              }}
            </p>
          </div>
          <SettingsToggle
            :model-value="!!status?.listenbrainz.enabled"
            :disabled="!status?.listenbrainz.token"
            :label="$t('settings.listenbrainz')"
            @update:model-value="setEnabled(IDS.listenbrainzToken, $event)"
          />
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="listenbrainzToken"
            data-testid="scrobbling-listenbrainz-token"
            type="password"
            autocomplete="off"
            class="flex-1 min-w-48 px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
            :placeholder="listenbrainzPreview || $t('settings.listenbrainzToken')"
            :aria-label="$t('settings.listenbrainzToken')"
          />
          <button
            data-testid="scrobbling-listenbrainz-test"
            class="px-3 py-1.5 rounded-field bg-primary text-primary-content text-xs fx-depth"
            :disabled="busy !== null"
            @click="saveAndTestListenbrainz"
          >
            {{ $t('settings.scrobblingTest') }}
          </button>
        </div>
      </div>

      <p v-if="error" class="text-xs text-error">{{ error }}</p>
      <p v-else-if="message" class="text-xs text-base-content/60">{{ message }}</p>
    </div>
  </SettingsGroup>
</template>
