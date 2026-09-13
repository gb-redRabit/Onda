<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUpToLine, Pause, Pencil, Play, Plus, Radio, Trash2 } from '@lucide/vue';
import { useRadioStore } from '@renderer/stores/radio';
import { usePlayerStore } from '@renderer/stores/player';
import OnlineButton from '@renderer/components/online/OnlineButton.vue';
import type { IpcRadioStation } from '@shared/types/ipc';

const emit = defineEmits<{ add: [] }>();

const radio = useRadioStore();
const player = usePlayerStore();
const { t } = useI18n();

const editingRadioId = ref<string | null>(null);
const editingRadioName = ref('');

function startRadioRename(s: IpcRadioStation) {
  editingRadioId.value = s.id;
  editingRadioName.value = s.name;
}

function commitRadioRename(id: string) {
  if (editingRadioId.value !== id) return;
  editingRadioId.value = null;
  void radio.renameStation(id, editingRadioName.value);
}
</script>

<template>
  <section>
    <div class="flex items-center gap-2 mb-3">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 flex-1">
        <Radio :size="14" class="text-primary" />
        {{ t('saved.radioTitle') }}
      </h2>
      <OnlineButton variant="secondary" size="sm" @click="emit('add')">
        <Plus :size="12" />
        {{ t('saved.addRadio') }}
      </OnlineButton>
    </div>
    <div v-if="radio.stations.length === 0" class="space-y-2">
      <div
        class="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-base-content/50"
      >
        <Radio :size="24" class="mx-auto mb-2 opacity-40" />
        {{ t('saved.radioSoon') }}
      </div>
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="s in radio.stations"
        :key="s.id"
        class="group flex items-center gap-3 rounded-box bg-base-100 border border-base-300 p-3 hover:border-base-300 transition-colors"
        :class="{ 'border-primary/60': radio.playingStationId === s.id }"
      >
        <button
          type="button"
          class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          :class="
            radio.playingStationId === s.id
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          :title="t('saved.playRadio')"
          @click="radio.playingStationId === s.id ? player.togglePlay() : radio.playStation(s)"
        >
          <Pause
            v-if="radio.playingStationId === s.id && player.isPlaying"
            :size="16"
            fill="currentColor"
          />
          <Play v-else :size="16" fill="currentColor" />
        </button>
        <div class="min-w-0 flex-1">
          <template v-if="editingRadioId === s.id">
            <input
              v-model="editingRadioName"
              type="text"
              class="w-full bg-base-100 border border-base-300 fx-depth rounded-field px-2 py-1 text-sm text-base-content focus:outline-none focus:border-primary"
              @keyup.enter="commitRadioRename(s.id)"
              @keyup.esc="editingRadioId = null"
              @blur="commitRadioRename(s.id)"
            />
          </template>
          <template v-else>
            <h3 class="text-sm font-semibold text-base-content truncate">{{ s.name }}</h3>
            <p class="text-xs text-base-content/70 truncate">{{ s.url }}</p>
          </template>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            class="fx-noise p-2 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :title="t('saved.renameRadio')"
            @click="startRadioRename(s)"
          >
            <Pencil :size="14" />
          </button>
          <button
            type="button"
            class="fx-noise p-2 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :title="t('saved.moveRadioTop')"
            @click="radio.moveToTop(s.id)"
          >
            <ArrowUpToLine :size="14" />
          </button>
          <button
            type="button"
            class="fx-noise p-2 fx-depth rounded-field text-base-content/70 hover:text-error hover:bg-base-content/10 transition-colors"
            :title="t('common.delete')"
            @click="radio.removeStation(s.id)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
