<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Power, RefreshCw, FolderOpen, Trash2, ChevronDown, Puzzle, Loader2, Check, BookOpen } from '@lucide/vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import type { PluginSettingField } from '@shared/types/ipc';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import PluginsGuide from '@renderer/components/settings/PluginsGuide.vue';

const { t } = useI18n();
const store = usePluginsStore();

const guideOpen = ref(false);

onMounted(() => {
  store.load().catch(() => undefined);
});

const loading = computed(() => store.loading);

const statusLabel = (status: string): string => {
  switch (status) {
    case 'loading':
    case 'loaded':
    case 'error':
    case 'new':
      return t(`plugins.status.${status}`);
    default:
      return status;
  }
};

const statusClass = (status: string): string => {
  switch (status) {
    case 'loaded':
      return 'badge-success';
    case 'error':
      return 'badge-error';
    case 'loading':
      return 'badge-info';
    default:
      return 'badge-ghost';
  }
};

async function onToggle(id: string): Promise<void> {
  await store.toggle(id);
}

async function onInstall(): Promise<void> {
  await store.installFromFolder();
}

async function onRefresh(): Promise<void> {
  await store.refresh();
}

async function onUninstall(id: string): Promise<void> {
  await store.uninstall(id);
}

const openLogs = ref<Set<string>>(new Set());

function toggleLogs(id: string) {
  const next = new Set(openLogs.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openLogs.value = next;
}

const logsFor = (id: string): string[] => store.logs[id] || [];

const commandsFor = computed(() => store.commands);

function testCommand(commandId: string): void {
  store.dispatchCommand(commandId);
}

const settingsValue = (pId: string, field: PluginSettingField): unknown => {
  const value = store.settingsOf(pId)[field.key];
  return value === undefined ? field.default : value;
};

async function onSettingChange(pId: string, key: string, value: unknown): Promise<void> {
  await store.saveSetting(pId, key, value);
}
</script>

<template>
  <SettingsPanel :title="t('settings.plugins')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="t('plugins.title')"
        :description="t('plugins.description')"
      />
      <div class="flex items-center gap-2 pt-2">
        <button
          class="flex items-center gap-1.5 px-3 h-8 rounded-field text-xs font-medium bg-primary text-primary-content fx-depth"
          @click="onInstall"
        >
          <FolderOpen :size="13" />
          {{ t('plugins.installFromFolder') }}
        </button>
        <button
          class="flex items-center gap-1.5 px-3 h-8 rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :disabled="loading"
          @click="onRefresh"
        >
          <Loader2 v-if="loading" :size="13" class="animate-spin" />
          <RefreshCw v-else :size="13" />
          {{ t('plugins.refresh') }}
        </button>
        <button
          class="flex items-center gap-1.5 px-3 h-8 rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="guideOpen = true"
        >
          <BookOpen :size="13" />
          {{ t('plugins.guide.title') }}
        </button>
      </div>
    </SettingsCard>

    <PluginsGuide v-if="guideOpen" @close="guideOpen = false" />

    <div v-if="store.plugins.length === 0 && !loading" class="py-10 text-center text-sm text-base-content/50">
      <Puzzle :size="36" class="mx-auto mb-3 opacity-20" />
      {{ t('plugins.empty') }}
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <SettingsCard v-for="p in store.plugins" :key="p.id" class="!p-0">
        <div class="p-4">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-box bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Puzzle :size="16" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold truncate">{{ p.name }}</span>
                <span class="text-xs text-base-content/50 shrink-0">{{ p.version }}</span>
              </div>
              <div class="text-xs text-base-content/50 truncate mt-0.5">
                {{ p.author ? `${p.author} · ` : '' }}{{ p.description || p.id }}
              </div>
              <div class="flex items-center gap-2 mt-2">
                <span class="badge badge-sm" :class="statusClass(p.status)">
                  {{ statusLabel(p.status) }}
                </span>
                <span v-if="p.status === 'loaded' || p.enabled" class="flex items-center gap-1 text-xs text-success">
                  <Check :size="11" />
                  {{ t('plugins.enabled') }}
                </span>
              </div>
              <div v-if="p.status === 'error' && p.error" class="text-xs text-error mt-1 break-words">
                {{ p.error }}
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <Power
                :size="15"
                class="cursor-pointer"
                :class="p.enabled ? 'text-success' : 'text-base-content/40 hover:text-base-content'"
                @click="onToggle(p.id)"
              />
              <Trash2
                :size="15"
                class="cursor-pointer text-base-content/40 hover:text-error"
                @click="onUninstall(p.id)"
              />
            </div>
          </div>

          <div v-if="commandsFor.filter((c) => (c as { pluginId?: string }).pluginId === p.id).length" class="mt-3 pt-3 border-t border-base-300/60">
            <div class="text-xs font-medium text-base-content/70 mb-1.5">{{ t('plugins.commands') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="cmd in commandsFor.filter((c) => (c as { pluginId?: string }).pluginId === p.id)"
                :key="cmd.id"
                class="flex items-center gap-1 px-2 h-7 rounded-field text-xs border border-base-300 hover:bg-base-200"
                @click="testCommand(cmd.id)"
              >
                {{ cmd.label }}
              </button>
            </div>
          </div>

          <div v-if="store.settingFields(p.id).length" class="mt-3 pt-3 border-t border-base-300/60">
            <div class="text-xs font-medium text-base-content/70 mb-1.5">{{ t('plugins.settings') }}</div>
            <div
              v-for="field in store.settingFields(p.id)"
              :key="field.key"
              class="flex items-center justify-between gap-3 py-1"
            >
              <label class="text-xs text-base-content/60 min-w-0 flex-1 truncate">{{ field.label }}</label>
              <input
                v-if="field.type === 'text'"
                type="text"
                class="setting-input"
                :value="String(settingsValue(p.id, field) ?? '')"
                @change="
                  onSettingChange(p.id, field.key, ($event.target as HTMLInputElement).value)
                "
              />
              <input
                v-else-if="field.type === 'number'"
                type="number"
                class="setting-input w-24"
                :min="field.min"
                :max="field.max"
                :value="Number(settingsValue(p.id, field))"
                @change="
                  onSettingChange(p.id, field.key, Number(($event.target as HTMLInputElement).value))
                "
              />
              <input
                v-else
                type="checkbox"
                class="toggle toggle-sm"
                :checked="settingsValue(p.id, field) === true"
                @change="
                  onSettingChange(p.id, field.key, ($event.target as HTMLInputElement).checked)
                "
              />
            </div>
          </div>

          <button
            class="flex items-center gap-1 text-xs text-base-content/50 hover:text-base-content mt-3"
            @click="toggleLogs(p.id)"
          >
            <ChevronDown :size="12" :class="openLogs.has(p.id) ? 'rotate-180' : ''" />
            {{ t('plugins.logs') }}
          </button>
          <pre
            v-if="openLogs.has(p.id)"
            class="mt-2 p-2 rounded-field bg-base-200 text-[11px] leading-relaxed text-base-content/70 overflow-auto max-h-48 whitespace-pre-wrap break-all"
          >{{ logsFor(p.id).join('\n') || t('plugins.noLogs') }}</pre>
        </div>
      </SettingsCard>
    </div>
  </SettingsPanel>
</template>