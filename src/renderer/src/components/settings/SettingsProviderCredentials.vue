<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LogIn } from '@lucide/vue';
import { providerLabel } from '@renderer/utils/providerLabels';
import ProviderIcon from '@renderer/components/online/providers/ProviderIcon.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import { useUIStore } from '@renderer/stores/ui';

// Zbiorczy ekran poświadczeń providerów wymagających lub obsługujących logowanie (cookie) —
// np. 115/Quark/Baidu/Google Drive. Spójny wizualnie z SettingsNetworkPlatform / SettingsApiKeys.
// Cookie jest szyfrowane przez safeStorage w procesie głównym.

interface Row {
  id: string;
  label: string;
  icon: string;
  hasCookie: boolean;
  required: boolean;
}

const { t } = useI18n();
const rows = ref<Row[]>([]);
const editing = reactive<Record<string, string>>({});
const busy = reactive<Record<string, boolean>>({});
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = ((await window.api.invoke('providers:auth:list')) as Row[] | undefined) ?? [];
  } catch {
    rows.value = [];
  }
  loading.value = false;
}

onMounted(load);

async function save(id: string): Promise<void> {
  const cookie = (editing[id] || '').trim();
  if (!cookie) return;
  busy[id] = true;
  try {
    const ok = (await window.api.invoke('providers:cred:set', {
      providerId: id,
      cookie
    })) as boolean;
    if (ok) {
      editing[id] = '';
      await load();
    } else {
      useUIStore().notify('error', t('providers.save'), t('providers.cookieSaveFailed'));
    }
  } finally {
    busy[id] = false;
  }
}

async function clear(id: string): Promise<void> {
  busy[id] = true;
  try {
    await window.api.invoke('providers:cred:clear', id);
    await load();
  } finally {
    busy[id] = false;
  }
}

async function login(id: string): Promise<void> {
  busy[id] = true;
  try {
    const res = (await window.api.invoke('providers:cred:login', id)) as {
      success: boolean;
      canceled?: boolean;
      error?: string;
    };
    if (res?.success) {
      await load();
      useUIStore().notify('success', t('providers.login'), t('providers.cookieSet'));
    } else if (res?.error) {
      useUIStore().notify('error', t('providers.login'), res.error);
    }
  } finally {
    busy[id] = false;
  }
}
</script>

<template>
  <div data-testid="settings-provider-credentials">
    <SettingsGroup
      :title="t('settings.providerCredentials')"
      :description="t('settings.providerCredentialsHelp')"
    >
      <div v-if="loading" class="py-4 text-sm text-base-content/50">
        {{ t('common.loading') }}
      </div>

      <div v-else-if="!rows.length" class="py-4 text-sm text-base-content/50">
        {{ t('settings.providerCredentialsEmpty') }}
      </div>

      <div v-for="row in rows" v-else :key="row.id" class="py-3 space-y-2.5">
        <div class="flex items-center gap-2.5">
          <ProviderIcon :provider-id="row.id" :label="row.label" :size="20" />
          <span class="text-[13px] font-medium text-base-content">
            {{ providerLabel(row.id, row.label, t) }}
          </span>
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="row.hasCookie ? 'bg-success' : row.required ? 'bg-warning' : 'bg-base-300'"
          />
          <span
            class="text-xs"
            :class="
              row.hasCookie
                ? 'text-success'
                : row.required
                  ? 'text-warning'
                  : 'text-base-content/50'
            "
            :data-testid="'cred-state-' + row.id"
          >
            {{
              row.hasCookie
                ? t('providers.cookieSet')
                : row.required
                  ? t('providers.cookieMissing')
                  : t('providers.credentialsOptional')
            }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="fx-noise fx-depth inline-flex shrink-0 items-center gap-1.5 rounded-field bg-primary px-3 py-1.5 text-xs font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
            :disabled="busy[row.id]"
            @click="login(row.id)"
          >
            <LogIn :size="13" />
            {{ t('providers.login') }}
          </button>
          <span class="text-xs text-base-content/50">{{ t('providers.loginOrPaste') }}</span>
          <input
            v-model="editing[row.id]"
            type="text"
            class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-200/(--glass-alpha) px-3 py-1.5 text-xs text-base-content fx-depth transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            :aria-label="t('providers.cookiePlaceholder')"
            :placeholder="t('providers.cookiePlaceholder')"
            @keydown.enter="save(row.id)"
          />
          <button
            type="button"
            class="fx-noise fx-depth shrink-0 rounded-field border border-base-300 bg-base-100 px-3 py-1.5 text-xs text-base-content/80 transition-colors hover:bg-base-content/10 disabled:opacity-50"
            :disabled="busy[row.id] || !editing[row.id]?.trim()"
            @click="save(row.id)"
          >
            {{ t('providers.save') }}
          </button>
          <button
            v-if="row.hasCookie"
            type="button"
            class="fx-noise fx-depth shrink-0 rounded-field border border-base-300 px-3 py-1.5 text-xs text-base-content/70 transition-colors hover:border-error/40 hover:bg-error/10 hover:text-error disabled:opacity-50"
            :disabled="busy[row.id]"
            @click="clear(row.id)"
          >
            {{ t('common.clear') }}
          </button>
        </div>
      </div>
    </SettingsGroup>
  </div>
</template>
