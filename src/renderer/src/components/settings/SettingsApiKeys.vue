<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();
const showAdd = ref(false);
const newName = ref('');
const newService = ref('generic');
const newKey = ref('');

function addKey() {
  if (!newName.value.trim() || !newKey.value.trim()) return;
  const entry = {
    id: Date.now().toString(36),
    name: newName.value.trim(),
    service: newService.value,
    key: newKey.value.trim(),
    isActive: true
  };
  settings.apiKeys.keys = [...settings.apiKeys.keys, entry];
  settings.saveImmediate?.();
  newName.value = '';
  newKey.value = '';
  showAdd.value = false;
}

function removeKey(id: string) {
  settings.apiKeys.keys = settings.apiKeys.keys.filter((k) => k.id !== id);
  settings.saveImmediate?.();
}

function toggleActive(id: string, active: boolean) {
  settings.apiKeys.keys = settings.apiKeys.keys.map((k) =>
    k.id === id ? { ...k, isActive: active } : k
  );
  settings.saveImmediate?.();
}
</script>

<template>
  <SettingsPanel :title="$t('settings.apiKeys')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.apiKeysTitle')"
        :description="$t('settings.apiKeysDesc')"
      />
      <div
        v-if="settings.apiKeys.keys.length === 0"
        class="py-4 text-center text-sm text-base-content/50"
      >
        {{ $t('settings.noApiKeys') }}
      </div>
      <div v-else class="divide-y divide-base-300">
        <div v-for="k in settings.apiKeys.keys" :key="k.id" class="flex items-center gap-3 py-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ k.name }}</div>
            <div class="text-xs text-base-content/50 truncate">
              {{ k.service }} · {{ k.key.slice(0, 4) }}…
            </div>
          </div>
          <SettingsToggle
            :model-value="!!k.isActive"
            @update:model-value="toggleActive(k.id, $event)"
          />
          <button
            class="px-2 py-1 rounded-field text-xs border border-base-300 hover:bg-base-200"
            @click="removeKey(k.id)"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button
          v-if="!showAdd"
          class="px-3 py-1.5 rounded-field bg-primary text-primary-content text-sm fx-depth fx-noise"
          @click="showAdd = true"
        >
          {{ $t('settings.addApiKey') }}
        </button>
        <div
          v-else
          class="flex-1 flex flex-col gap-2 p-3 rounded-field border border-base-300 bg-base-200/50"
        >
          <input
            v-model="newName"
            :placeholder="$t('settings.apiKeyName')"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
          />
          <select
            v-model="newService"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
          >
            <option value="generic">Generic</option>
            <option value="youtube">YouTube</option>
            <option value="soundcloud">SoundCloud</option>
            <option value="openai">OpenAI</option>
          </select>
          <input
            v-model="newKey"
            type="password"
            :placeholder="$t('settings.apiKeyValue')"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
          />
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 rounded-field bg-primary text-primary-content text-sm fx-depth fx-noise"
              @click="addKey"
            >
              {{ $t('common.save') }}
            </button>
            <button
              class="px-3 py-1.5 rounded-field border border-base-300 text-sm"
              @click="showAdd = false"
            >
              {{ $t('common.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.apiKeysEncrypted')"
        :description="$t('settings.apiKeysEncryptedDesc')"
      />
    </SettingsCard>
  </SettingsPanel>
</template>
