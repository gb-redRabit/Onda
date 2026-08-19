<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileAudio, Link2, AlertCircle, CheckCircle2, Plus } from '@lucide/vue';
import YTButton from '@renderer/components/youtube/YTButton.vue';
import { useRadioStore } from '@renderer/stores/radio';
import { useUIStore } from '@renderer/stores/ui';
import { parseRadioFile, parseDirectUrl, type ParsedRadioStation } from '@renderer/utils/radioParser';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const radio = useRadioStore();
const ui = useUIStore();
const { t } = useI18n();

const fileName = ref('');
const fileStations = ref<ParsedRadioStation[]>([]);
const selected = ref<Set<number>>(new Set());
const parseError = ref('');
const directUrl = ref('');
const directName = ref('');
const directError = ref('');
const adding = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      fileName.value = '';
      fileStations.value = [];
      selected.value = new Set();
      parseError.value = '';
      directUrl.value = '';
      directName.value = '';
      directError.value = '';
    }
  }
);

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  parseError.value = '';
  fileName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    const parsed = parseRadioFile(file.name, text);
    if (parsed.length === 0) {
      parseError.value = 'radio.fileNoStations';
      fileStations.value = [];
      selected.value = new Set();
      return;
    }
    fileStations.value = parsed;
    selected.value = new Set(parsed.map((_, i) => i));
  };
  reader.onerror = () => {
    parseError.value = 'radio.fileReadError';
  };
  reader.readAsText(file);
}

function toggleSelected(i: number) {
  const next = new Set(selected.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  selected.value = next;
}

async function addFromFile() {
  const chosen = fileStations.value.filter((_, i) => selected.value.has(i));
  if (chosen.length === 0) return;
  adding.value = true;
  try {
    const added = await radio.addStations(chosen);
    ui.notify('success', String(added), t('radio.addedStations', { count: added }), 2500);
    emit('update:modelValue', false);
  } finally {
    adding.value = false;
  }
}

async function addDirect() {
  const station = parseDirectUrl(directUrl.value);
  if (!station) {
    directError.value = 'radio.invalidUrl';
    return;
  }
  if (directName.value.trim()) station.name = directName.value.trim();
  adding.value = true;
  try {
    const added = await radio.addStations([station]);
    ui.notify('success', String(added), t('radio.addedStations', { count: added }), 2500);
    emit('update:modelValue', false);
  } finally {
    adding.value = false;
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="emit('update:modelValue', false)"
  >
    <div
      class="w-[520px] max-h-[80vh] overflow-y-auto rounded-2xl bg-bg-surface border border-border-default p-5 space-y-5"
    >
      <h2 class="text-sm font-semibold text-fg-base">{{ $t('saved.addRadio') }}</h2>

      <!-- file import -->
      <div class="space-y-2">
        <div
          class="flex items-center gap-2 rounded-xl border border-dashed border-border-subtle p-3 hover:border-accent-base/50 transition-colors"
        >
          <FileAudio :size="16" class="text-fg-muted shrink-0" />
          <label class="flex-1 min-w-0 cursor-pointer text-sm text-fg-muted hover:text-fg-base truncate">
            <span v-if="fileName">{{ fileName }}</span>
            <span v-else>{{ $t('radio.pickFile') }}</span>
            <input
              type="file"
              accept=".pls,.m3u,.m3u8,.xspf"
              class="hidden"
              @change="onFileSelected"
            />
          </label>
        </div>
        <p class="text-xs text-fg-faint">{{ $t('radio.fileHint') }}</p>

        <div v-if="parseError" class="flex items-center gap-2 text-xs text-red-base">
          <AlertCircle :size="14" />
          {{ $t(parseError) }}
        </div>

        <div v-if="fileStations.length > 0" class="space-y-1 max-h-48 overflow-y-auto pr-1">
          <label
            v-for="(s, i) in fileStations"
            :key="i"
            class="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-hover cursor-pointer"
          >
            <input
              type="checkbox"
              class="accent-accent-base"
              :checked="selected.has(i)"
              @change="toggleSelected(i)"
            />
            <span class="text-sm text-fg-base truncate">{{ s.name }}</span>
            <span class="text-xs text-fg-faint truncate flex-1 text-right">{{ s.url }}</span>
          </label>
        </div>

        <div class="flex items-center gap-2 justify-end">
          <YTButton
            variant="secondary"
            size="sm"
            :disabled="fileStations.length === 0 || selected.size === 0 || adding"
            @click="addFromFile"
          >
            <CheckCircle2 :size="12" />
            {{ $t('radio.addSelected', { count: selected.size }) }}
          </YTButton>
        </div>
      </div>

      <div class="h-px bg-border-default" />

      <!-- direct URL -->
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-xs font-semibold text-fg-muted">
          <Link2 :size="14" />
          {{ $t('radio.directUrl') }}
        </div>
        <input
          v-model="directUrl"
          type="text"
          :placeholder="$t('radio.urlPlaceholder')"
          class="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:border-accent-base"
          @keyup.enter="addDirect"
        />
        <input
          v-model="directName"
          type="text"
          :placeholder="$t('radio.namePlaceholder')"
          class="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:border-accent-base"
          @keyup.enter="addDirect"
        />
        <div v-if="directError" class="flex items-center gap-2 text-xs text-red-base">
          <AlertCircle :size="14" />
          {{ $t(directError) }}
        </div>
        <div class="flex items-center gap-2 justify-end">
          <YTButton variant="primary" size="sm" :disabled="adding" @click="addDirect">
            <Plus :size="12" />
            {{ $t('radio.addUrl') }}
          </YTButton>
        </div>
      </div>

      <div class="flex items-center justify-end">
        <YTButton variant="ghost" size="sm" @click="emit('update:modelValue', false)">
          {{ $t('common.cancel') }}
        </YTButton>
      </div>
    </div>
  </div>
</template>