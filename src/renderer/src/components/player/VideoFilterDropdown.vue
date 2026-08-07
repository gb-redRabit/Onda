<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Wand } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';

const { t } = useI18n();
const settings = useSettingsStore();
const showFilters = ref(false);
const container = ref<HTMLElement | null>(null);

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (showFilters.value && container.value && !container.value.contains(target)) {
    showFilters.value = false;
  }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

const videoFilters = [
  { id: 'none', label: () => t('videoFilters.none'), css: 'none' },
  { id: 'grayscale', label: () => t('videoFilters.grayscale'), css: 'grayscale(100%)' },
  { id: 'sepia', label: () => t('videoFilters.sepia'), css: 'sepia(80%)' },
  { id: 'contrast', label: () => t('videoFilters.highContrast'), css: 'contrast(150%)' },
  { id: 'brightness', label: () => t('videoFilters.brightness'), css: 'brightness(150%)' },
  { id: 'saturate', label: () => t('videoFilters.saturation'), css: 'saturate(200%)' },
  { id: 'invert', label: () => t('videoFilters.invert'), css: 'invert(100%)' },
  { id: 'blur', label: () => t('videoFilters.blur'), css: 'blur(2px)' },
  { id: 'hue-rotate', label: () => t('videoFilters.hueRotate'), css: 'hue-rotate(90deg)' }
];

function setFilter(filter: (typeof videoFilters)[0]) {
  settings.updatePlayback({ videoFilter: filter.css });
  showFilters.value = false;
}
</script>

<template>
  <div ref="container" class="relative">
    <button
      class="text-white/40 hover:text-white/80 transition-colors mt-1"
      :class="{ 'text-accent-base!': settings.playback.videoFilter !== 'none' }"
      @click="showFilters = !showFilters"
    >
      <Wand :size="14" />
    </button>
    <Transition name="menu-fade">
      <div
        v-if="showFilters"
        class="absolute bottom-full right-0 mb-3 w-44 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-1.5 z-50"
      >
        <div class="px-3 py-1.5 text-[10px] text-white/30 font-medium uppercase tracking-wider">
          {{ $t('videoFilters.title') }}
        </div>
        <button
          v-for="f in videoFilters"
          :key="f.id"
          class="w-full px-3 py-1.5 text-left text-sm text-white/50 hover:text-white hover:bg-white/6 transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base!': settings.playback.videoFilter === f.css }"
          @click="setFilter(f)"
        >
          <span
            class="w-3 h-3 rounded-full border shrink-0 transition-colors"
            :class="
              settings.playback.videoFilter === f.css
                ? 'bg-accent-base border-accent-base'
                : 'border-white/20'
            "
          />
          {{ f.label() }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
