<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { CornerDownRight, CornerDownLeft, CornerUpRight, CornerUpLeft } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsPositionGrid from '@renderer/components/settings/SettingsPositionGrid.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const positions = [
  { id: 'top-left' as const, labelKey: 'settings.topLeft', icon: CornerUpLeft },
  { id: 'top-right' as const, labelKey: 'settings.topRight', icon: CornerUpRight },
  { id: 'bottom-left' as const, labelKey: 'settings.bottomLeft', icon: CornerDownLeft },
  { id: 'bottom-right' as const, labelKey: 'settings.bottomRight', icon: CornerDownRight }
];

const positionOptions = computed(() =>
  positions.map((p) => ({ id: p.id, label: t(p.labelKey), icon: p.icon }))
);
</script>

<template>
  <SettingsPanel :title="$t('settings.toastTitle')" :description="$t('settings.toastDesc')">
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.toastPosition')" />
      <SettingsPositionGrid
        :model-value="settings.toast.position"
        :options="positionOptions"
        :selected-label="$t(positions.find((p) => p.id === settings.toast.position)?.labelKey ?? '')"
        @update:model-value="settings.updateToast({ position: $event as (typeof positions)[number]['id'] })"
      />
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.toastTypes')" />
      <div class="divide-y divide-border-default">
        <SettingsRow :label="$t('settings.toastSuccess')" :description="$t('settings.toastSuccessHint')">
          <SettingsToggle
            :model-value="settings.toast.showSuccess"
            @update:model-value="settings.updateToast({ showSuccess: $event })"
          />
        </SettingsRow>
        <SettingsRow :label="$t('settings.toastInfo')" :description="$t('settings.toastInfoHint')">
          <SettingsToggle
            :model-value="settings.toast.showInfo"
            @update:model-value="settings.updateToast({ showInfo: $event })"
          />
        </SettingsRow>
        <SettingsRow :label="$t('settings.toastWarn')" :description="$t('settings.toastWarnHint')">
          <SettingsToggle
            :model-value="settings.toast.showWarning"
            @update:model-value="settings.updateToast({ showWarning: $event })"
          />
        </SettingsRow>
        <SettingsRow :label="$t('settings.toastErrors')" :description="$t('settings.toastErrorsHint')">
          <SettingsToggle :model-value="true" disabled />
        </SettingsRow>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
