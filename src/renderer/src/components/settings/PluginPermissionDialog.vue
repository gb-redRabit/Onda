<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';
import type { PluginInfo } from '@shared/types/ipc';

const props = defineProps<{ plugin: PluginInfo }>();
const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useI18n();

const panelRef = ref<HTMLElement | null>(null);
useDialogFocus(panelRef, { closeOnEscape: true, onEscape: () => emit('cancel') });

const permissions = computed(() => props.plugin.permissions || {});
const grantedCapabilities = computed(() => {
  const granted: string[] = [];
  if (permissions.value.storage) granted.push(t('plugins.permissionStorage'));
  if (permissions.value.notifications) granted.push(t('plugins.permissionNotifications'));
  if (permissions.value.player) granted.push(t('plugins.permissionPlayer'));
  if (permissions.value.visual) granted.push(t('plugins.permissionVisual'));
  if (permissions.value.network?.allow.length) granted.push(t('plugins.permissionNetwork'));
  return granted;
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-neutral/70 p-4 sm:p-6"
      @click.self="$emit('cancel')"
      @keydown.esc="$emit('cancel')"
    >
      <section
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-permission-title"
        data-testid="plugin-permission-dialog"
        tabindex="-1"
        class="w-full max-w-xl max-h-full flex flex-col rounded-box bg-base-100 border border-base-300 shadow-2xl overflow-hidden"
      >
        <header class="flex items-start gap-3 px-5 py-4 border-b border-base-300">
          <div class="flex-1 min-w-0">
            <h2 id="plugin-permission-title" class="text-lg font-semibold">
              {{ t('plugins.enableConfirmTitle') }}
            </h2>
            <p class="mt-1 text-sm text-base-content/60">
              {{ plugin.name }} <span v-if="plugin.version">· v{{ plugin.version }}</span>
              <span v-if="plugin.author">· {{ plugin.author }}</span>
            </p>
          </div>
          <button
            type="button"
            class="ui-icon-button shrink-0"
            :aria-label="t('common.close')"
            @click="$emit('cancel')"
          >
            ×
          </button>
        </header>

        <div class="min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          <p v-if="plugin.description" class="text-sm text-base-content/70">
            {{ plugin.description }}
          </p>

          <div class="rounded-field border border-warning/30 bg-warning/10 px-3 py-2.5">
            <p class="text-sm font-medium text-warning">
              {{ t('plugins.enableConfirmWarning') }}
            </p>
            <p v-if="plugin.permissionReviewRequired" class="mt-1 text-xs text-base-content/70">
              {{ t('plugins.permissionChangedWarning') }}
            </p>
          </div>

          <section aria-labelledby="plugin-permission-capabilities" class="space-y-2">
            <h3 id="plugin-permission-capabilities" class="text-sm font-semibold">
              {{ t('plugins.requestedPermissions') }}
            </h3>
            <p v-if="grantedCapabilities.length === 0" class="text-sm text-base-content/60">
              {{ t('plugins.noOptionalPermissions') }}
            </p>
            <ul v-else class="space-y-1.5">
              <li
                v-for="capability in grantedCapabilities"
                :key="capability"
                class="flex gap-2 text-sm text-base-content/80"
              >
                <span class="text-primary" aria-hidden="true">•</span>
                <span>{{ capability }}</span>
              </li>
            </ul>

            <div v-if="permissions.network?.allow.length" class="pt-1">
              <p class="text-xs font-medium text-base-content/60 mb-1">
                {{ t('plugins.networkAllowlist') }}
              </p>
              <ul class="space-y-1">
                <li v-for="pattern in permissions.network.allow" :key="pattern">
                  <code
                    class="block rounded-field bg-base-200 px-2 py-1 text-xs text-base-content/80 break-all"
                    >{{ pattern }}</code
                  >
                </li>
              </ul>
            </div>
          </section>

          <section aria-labelledby="plugin-permission-hooks" class="space-y-2">
            <h3 id="plugin-permission-hooks" class="text-sm font-semibold">
              {{ t('plugins.requestedHooks') }}
            </h3>
            <p class="text-xs text-base-content/60">{{ t('plugins.hooksDescription') }}</p>
            <div v-if="plugin.hooks?.length" class="flex flex-wrap gap-1.5">
              <code
                v-for="hook in plugin.hooks"
                :key="hook"
                class="rounded-field bg-base-200 px-2 py-1 text-xs text-base-content/80"
                >{{ hook }}</code
              >
            </div>
            <p v-else class="text-sm text-base-content/60">
              {{ t('plugins.noHooksRequested') }}
            </p>
          </section>

          <section
            v-if="plugin.layoutElements?.length"
            aria-labelledby="plugin-permission-visual-slots"
            class="space-y-2"
          >
            <h3 id="plugin-permission-visual-slots" class="text-sm font-semibold">
              {{ t('plugins.requestedVisualSlots') }}
            </h3>
            <ul class="space-y-1">
              <li
                v-for="layout in plugin.layoutElements"
                :key="`${layout.element}:${layout.variant}`"
                class="text-sm text-base-content/70"
              >
                <code>{{ layout.element }} · {{ layout.variant }}</code>
                <span v-if="layout.label"> — {{ layout.label }}</span>
              </li>
            </ul>
          </section>

          <section
            v-if="plugin.uiSlots?.length"
            aria-labelledby="plugin-permission-ui-slots"
            class="space-y-2"
            data-testid="plugin-permission-ui-slots"
          >
            <h3 id="plugin-permission-ui-slots" class="text-sm font-semibold">
              {{ t('plugins.requestedUiSlots') }}
            </h3>
            <ul class="space-y-1">
              <li v-for="slot in plugin.uiSlots" :key="slot" class="text-sm text-base-content/70">
                <code>{{ slot }}</code>
                <span> — {{ t('plugins.uiSlotTextOnly') }}</span>
              </li>
            </ul>
          </section>
        </div>

        <footer class="flex justify-end gap-2 px-5 py-4 border-t border-base-300">
          <button
            type="button"
            class="px-3 h-9 rounded-field text-sm font-medium border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="$emit('cancel')"
          >
            {{ t('plugins.enableCancel') }}
          </button>
          <button
            type="button"
            class="px-3 h-9 rounded-field text-sm font-medium bg-primary text-primary-content fx-depth"
            @click="$emit('confirm')"
          >
            {{ t('plugins.enableConfirm') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
