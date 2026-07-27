<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { X, Upload } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';

const { t } = useI18n();

const props = defineProps<{
  track: MediaFile | null;
}>();
const emit = defineEmits<{
  close: [];
  saved: [
    tags: {
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
      genre?: string;
      track?: { no: number };
      name?: string;
      path?: string;
    }
  ];
}>();

const player = usePlayerStore();
const ui = useUIStore();

const title = ref('');
const artist = ref('');
const album = ref('');
const year = ref('');
const genre = ref('');
const trackNumber = ref('');
const name = ref('');
const saving = ref(false);
const uploadingCover = ref(false);
const coverUrl = ref<string | null>(null);
const coverObj = computed<{ type: string | null; data: string | null } | undefined>(() => {
  if (!coverUrl.value) return undefined;
  if (coverUrl.value.startsWith('data:') || coverUrl.value.startsWith('blob:')) {
    return { type: 'image', data: coverUrl.value };
  }
  return { type: 'video', data: coverUrl.value };
});

watch(
  () => props.track,
  (t) => {
    if (t) {
      title.value = t.metadata?.title || '';
      artist.value = t.metadata?.artist || '';
      album.value = t.metadata?.album || '';
      year.value = t.metadata?.year?.toString() || '';
      genre.value = t.metadata?.genre || '';
      trackNumber.value = t.metadata?.track?.no?.toString() || '';
      name.value = t.name.replace(/\.[^.]+$/, '');
    }
    loadCover();
  },
  { immediate: true }
);

async function loadCover() {
  if (!props.track) return;
  coverUrl.value = null;
  const cached = await window.api?.getCover(props.track.path);
  if (cached?.data) {
    if (cached.type === 'image') {
      coverUrl.value = cached.data;
    } else if (cached.type === 'video') {
      coverUrl.value = cached.data;
    }
    return;
  }
  const embedded = await window.api?.readCover(props.track.path);
  if (embedded?.data && embedded.data.length > 0) {
    const blob = new Blob([new Uint8Array(embedded.data)], { type: embedded.mime || 'image/jpeg' });
    coverUrl.value = URL.createObjectURL(blob);
  }
}

async function pickCover() {
  if (!props.track) return;
  const result = await window.api?.openImageDialog();
  if (result?.canceled || !result?.filePaths?.[0]) return;
  uploadingCover.value = true;
  try {
    const r = await window.api?.writeCover(props.track.path, result.filePaths[0]);
    if (r?.success) {
      ui.notify('success', t('tags.coverSaved'));
      player.invalidateCoverCache(props.track.path);
      loadCover();
    } else {
      ui.notify('error', t('tags.coverError'), r?.error);
    }
  } catch (e) {
    ui.notify('error', t('tags.coverError'), String(e));
  }
  uploadingCover.value = false;
}

async function save() {
  if (!props.track) return;
  saving.value = true;
  const hasRename =
    name.value && name.value + (props.track.name.match(/\.[^.]+$/)?.[0] || '') !== props.track.name;
  let newPath: string | undefined;
  if (hasRename) {
    const r = await window.api?.renameFile(props.track.path, name.value);
    if (!r?.success) {
      ui.notify('error', t('tags.renameError'), r?.error);
      saving.value = false;
      return;
    }
    newPath = r.newPath;
  }
  const tags: Record<string, string | undefined> = {
    title: title.value || undefined,
    artist: artist.value || undefined,
    album: album.value || undefined,
    year: year.value || undefined,
    genre: genre.value || undefined,
    trackNumber: trackNumber.value || undefined
  };
  const result = await window.api?.writeTags(newPath || props.track.path, tags);
  if (result?.success) {
    emit('saved', {
      title: title.value || undefined,
      artist: artist.value || undefined,
      album: album.value || undefined,
      year: year.value ? parseInt(year.value) : undefined,
      genre: genre.value || undefined,
      track: trackNumber.value ? { no: parseInt(trackNumber.value) || 1 } : undefined,
      name: name.value || undefined,
      path: newPath
    });
    saving.value = false;
    ui.notify('success', t('tags.saved'));
    setTimeout(() => emit('close'), 600);
  } else {
    ui.notify('error', t('tags.saveError'), result?.error);
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="track"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-lg mx-4 rounded-2xl bg-bg-base border border-border-default shadow-xl overflow-hidden"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 class="text-base font-bold">{{ $t('tags.title') }}</h2>
          <button
            class="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-fg-faint"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex gap-5 p-5">
          <div class="shrink-0 flex flex-col items-center gap-2">
            <div
              class="w-28 h-28 rounded-xl bg-bg-elevated border border-border-default overflow-hidden flex items-center justify-center"
            >
              <MediaCover :cover="coverObj" :size="32" fallback="music" />
            </div>
            <button
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-ghost text-accent-base hover:bg-accent-base hover:text-white transition-colors"
              :disabled="uploadingCover"
              @click="pickCover"
            >
              <Upload :size="12" /> {{ uploadingCover ? '...' : $t('tags.cover') }}
            </button>
          </div>

          <div class="flex-1 space-y-2.5 min-w-0">
            <label class="block">
              <span class="text-xs font-medium text-fg-muted">{{ $t('tags.filename') }}</span>
              <input
                v-model="name"
                class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-xs font-medium text-fg-muted">{{ $t('tags.titleField') }}</span>
              <input
                v-model="title"
                class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-xs font-medium text-fg-muted">{{ $t('tags.artist') }}</span>
              <input
                v-model="artist"
                class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-xs font-medium text-fg-muted">{{ $t('tags.album') }}</span>
              <input
                v-model="album"
                class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              />
            </label>
            <div class="grid grid-cols-3 gap-2.5">
              <label class="block">
                <span class="text-xs font-medium text-fg-muted">{{ $t('tags.year') }}</span>
                <input
                  v-model="year"
                  class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
                />
              </label>
              <label class="block col-span-2">
                <span class="text-xs font-medium text-fg-muted">{{ $t('tags.genre') }}</span>
                <input
                  v-model="genre"
                  class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
                />
              </label>
            </div>
            <label class="block">
              <span class="text-xs font-medium text-fg-muted">{{ $t('tags.trackNo') }}</span>
              <input
                v-model="trackNumber"
                class="w-full mt-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 px-5 py-4 border-t border-border-default">
          <button
            class="px-4 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover transition-colors"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            class="px-4 py-2 rounded-xl text-sm font-medium bg-accent-base text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            :disabled="saving || uploadingCover"
            @click="save"
          >
            {{ saving ? $t('tags.saving') : $t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
