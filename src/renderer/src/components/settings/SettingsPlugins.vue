<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Power,
  RefreshCw,
  FolderOpen,
  Trash2,
  ChevronDown,
  Puzzle,
  Loader2,
  Check,
  BookOpen,
  Download
} from '@lucide/vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import type { PluginUiInfo } from '@renderer/stores/plugins';
import { useUIStore } from '@renderer/stores/ui';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import type { PluginPermissions, PluginSettingField } from '@shared/types/ipc';
import PluginsGuide from '@renderer/components/settings/PluginsGuide.vue';
import PluginPermissionDialog from '@renderer/components/settings/PluginPermissionDialog.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const { t } = useI18n();
const store = usePluginsStore();
const ui = useUIStore();

const guideOpen = ref(false);
const enableReviewPlugin = ref<PluginUiInfo | null>(null);

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
      return 'bg-success/15 text-success';
    case 'error':
      return 'bg-error/15 text-error';
    case 'loading':
      return 'bg-info/15 text-info';
    default:
      return 'bg-base-content/10 text-base-content/60';
  }
};

function onToggle(plugin: PluginUiInfo): void {
  if (plugin.enabled) {
    void store.toggle(plugin.id);
    return;
  }
  enableReviewPlugin.value = plugin;
}

async function confirmEnable(): Promise<void> {
  const plugin = enableReviewPlugin.value;
  enableReviewPlugin.value = null;
  if (!plugin) return;
  const enabled = await store.approveAndEnable(plugin.id);
  if (!enabled) {
    ui.notify('error', t('plugins.enableFailed'), t('plugins.permissionChangedWarning'));
  }
}

async function onInstall(): Promise<void> {
  const result = await store.installFromFolder();
  if (result.success) {
    ui.notify('success', t('plugins.installSuccess'), t('plugins.installDisabledHint'));
  } else if (result.error !== 'cancelled') {
    ui.notify('error', t('plugins.installError'), result.error);
  }
}

function isInstalled(id: string): boolean {
  return store.plugins.some((p) => p.id === id);
}

function capabilityLabels(permissions: PluginPermissions): string[] {
  const labels: string[] = [];
  if (permissions.storage) labels.push(t('plugins.permissionStorage'));
  if (permissions.notifications) labels.push(t('plugins.permissionNotifications'));
  if (permissions.player) labels.push(t('plugins.permissionPlayer'));
  if (permissions.visual) labels.push(t('plugins.permissionVisual'));
  if (permissions.network?.allow.length) labels.push(t('plugins.permissionNetwork'));
  return labels;
}

async function onInstallExample(id: string): Promise<void> {
  const res = await store.installExample(id);
  if (res.success) {
    ui.notify('success', t('plugins.installSuccess'), t('plugins.installDisabledHint'));
  } else ui.notify('error', t('plugins.examplesError'), res.error);
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
  <SettingsGroup :title="t('plugins.title')" :description="t('plugins.description')">
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
        data-testid="plugins-refresh"
        @click="onRefresh"
      >
        <Loader2 v-if="loading" :size="13" class="animate-spin" />
        <RefreshCw v-else :size="13" />
        {{ t('plugins.refresh') }}
      </button>
      <button
        class="flex items-center gap-1.5 px-3 h-8 rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
        data-testid="plugins-guide-open"
        @click="guideOpen = true"
      >
        <BookOpen :size="13" />
        {{ t('plugins.guide.title') }}
      </button>
    </div>
  </SettingsGroup>

  <PluginsGuide v-if="guideOpen" @close="guideOpen = false" />
  <PluginPermissionDialog
    v-if="enableReviewPlugin"
    :plugin="enableReviewPlugin"
    @cancel="enableReviewPlugin = null"
    @confirm="confirmEnable"
  />

  <SettingsGroup
    v-if="store.examples.length"
    :title="t('plugins.examplesTitle')"
    :description="t('plugins.examplesDesc')"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
      <div
        v-for="ex in store.examples"
        :key="ex.id"
        class="flex items-start gap-3 p-3 rounded-field border border-base-300/70 bg-base-100"
      >
        <div
          class="w-8 h-8 rounded-box bg-primary/10 text-primary flex items-center justify-center shrink-0"
        >
          <Puzzle :size="14" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium truncate">{{ ex.name }}</span>
            <span class="text-[11px] text-base-content/50 shrink-0">{{ ex.version }}</span>
          </div>
          <div class="text-xs text-base-content/50 mt-0.5">
            {{ ex.author ? `${ex.author} · ` : '' }}{{ ex.description || ex.id }}
          </div>
          <div v-if="capabilityLabels(ex.permissions).length" class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="capability in capabilityLabels(ex.permissions)"
              :key="capability"
              class="inline-flex items-center px-1.5 py-0.5 rounded-selector bg-base-content/10 text-base-content/60 text-[10px] font-medium"
              >{{ capability }}</span
            >
          </div>
          <div
            v-if="ex.permissions.network?.allow.length"
            class="mt-1 text-[11px] text-base-content/50 break-all"
          >
            {{ t('plugins.networkAllowlist') }}
            <code v-for="pattern in ex.permissions.network.allow" :key="pattern" class="ml-1">
              {{ pattern }}
            </code>
          </div>
          <div v-if="ex.hooks?.length" class="flex flex-wrap gap-1 mt-1">
            <code
              v-for="hook in ex.hooks"
              :key="hook"
              class="rounded-field bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60"
              >{{ hook }}</code
            >
          </div>
          <div v-if="ex.layoutElements?.length" class="mt-1 text-[11px] text-base-content/50">
            {{ t('plugins.requestedVisualSlots') }}:
            <span
              v-for="(layout, index) in ex.layoutElements"
              :key="`${layout.element}:${layout.variant}`"
            >
              {{ index ? ', ' : '' }}{{ layout.element }} · {{ layout.variant }}
            </span>
          </div>
        </div>
        <button
          v-if="!isInstalled(ex.id)"
          class="flex items-center gap-1.5 px-2.5 h-7 rounded-field text-xs font-medium bg-primary text-primary-content fx-depth shrink-0"
          @click="onInstallExample(ex.id)"
        >
          <Download :size="12" />
          {{ t('plugins.examplesInstall') }}
        </button>
        <span v-else class="flex items-center gap-1 text-xs text-success shrink-0 px-1.5 h-7">
          <Check :size="12" />
          {{ t('plugins.examplesInstalled') }}
        </span>
      </div>
    </div>
  </SettingsGroup>

  <div
    v-if="store.plugins.length === 0 && !loading"
    class="py-10 text-center text-sm text-base-content/50"
  >
    <Puzzle :size="36" class="mx-auto mb-3 opacity-20" />
    {{ t('plugins.empty') }}
  </div>

  <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
    <SettingsGroup v-for="p in store.plugins" :key="p.id" :data-testid="`plugin-card-${p.id}`">
      <div class="p-4">
        <div class="flex items-start gap-3">
          <div
            class="w-9 h-9 rounded-box bg-primary/10 text-primary flex items-center justify-center shrink-0"
          >
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
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-selector text-[11px] font-medium"
                :class="statusClass(p.status)"
              >
                {{ statusLabel(p.status) }}
              </span>
              <span
                v-if="p.status === 'loaded' || p.enabled"
                class="flex items-center gap-1 text-xs text-success"
              >
                <Check :size="11" />
                {{ t('plugins.enabled') }}
              </span>
              <span
                v-if="p.permissionReviewRequired"
                class="inline-flex items-center px-2 py-0.5 rounded-selector text-[11px] font-medium bg-warning/15 text-warning"
                >{{ t('plugins.permissionReviewRequired') }}</span
              >
            </div>
            <div
              v-if="p.status === 'error' && p.error"
              class="text-xs text-error mt-1 wrap-break-word"
            >
              {{ p.error }}
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="ui-icon-button"
              :aria-label="p.enabled ? t('plugins.disable') : t('plugins.enable')"
              :title="p.enabled ? t('plugins.disable') : t('plugins.enable')"
              :data-testid="`plugin-toggle-${p.id}`"
              :disabled="loading"
              @click="onToggle(p)"
            >
              <Power :size="15" :class="p.enabled ? 'text-success' : 'text-base-content/50'" />
            </button>
            <button
              type="button"
              class="ui-icon-button text-base-content/50 hover:text-error"
              :aria-label="t('plugins.uninstall')"
              :title="t('plugins.uninstall')"
              @click="onUninstall(p.id)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>

        <div
          v-if="commandsFor.filter((c) => (c as { pluginId?: string }).pluginId === p.id).length"
          class="mt-3 pt-3 border-t border-base-300/60"
        >
          <div class="text-xs font-medium text-base-content/70 mb-1.5">
            {{ t('plugins.commands') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="cmd in commandsFor.filter(
                (c) => (c as { pluginId?: string }).pluginId === p.id
              )"
              :key="cmd.id"
              class="flex items-center gap-1 px-2 h-7 rounded-field text-xs border border-base-300 hover:bg-base-200"
              @click="testCommand(cmd.id)"
            >
              {{ cmd.label }}
            </button>
          </div>
        </div>

        <div v-if="store.settingFields(p.id).length" class="mt-3 pt-3 border-t border-base-300/60">
          <div class="text-xs font-medium text-base-content/70 mb-1.5">
            {{ t('plugins.settings') }}
          </div>
          <div
            v-for="field in store.settingFields(p.id)"
            :key="field.key"
            class="flex items-center justify-between gap-3 py-1"
          >
            <label class="text-xs text-base-content/60 min-w-0 flex-1 truncate">{{
              field.label
            }}</label>
            <input
              v-if="field.type === 'text'"
              type="text"
              :data-testid="`plugin-setting-${p.id}-${field.key}`"
              class="w-40 px-2 py-1 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-xs focus:border-primary focus:outline-none"
              :value="String(settingsValue(p.id, field) ?? '')"
              @change="onSettingChange(p.id, field.key, ($event.target as HTMLInputElement).value)"
            />
            <input
              v-else-if="field.type === 'number'"
              type="number"
              :data-testid="`plugin-setting-${p.id}-${field.key}`"
              class="w-24 px-2 py-1 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-xs focus:border-primary focus:outline-none"
              :min="field.min"
              :max="field.max"
              :value="Number(settingsValue(p.id, field))"
              @change="
                onSettingChange(p.id, field.key, Number(($event.target as HTMLInputElement).value))
              "
            />
            <SettingsToggle
              v-else
              :data-testid="`plugin-setting-${p.id}-${field.key}`"
              :model-value="settingsValue(p.id, field) === true"
              @update:model-value="onSettingChange(p.id, field.key, $event)"
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
    </SettingsGroup>
  </div>
</template>
