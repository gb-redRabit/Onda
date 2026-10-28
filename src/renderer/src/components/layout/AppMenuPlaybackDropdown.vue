<script setup lang="ts">
import {
  PictureInPicture,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  SlidersHorizontal
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioFxStore } from '@renderer/stores/audioFx';
import { getPlayerPiPHandler } from '@renderer/composables/playerPiPHandler';
import AppMenuItem from './AppMenuItem.vue';

// Odtwarzanie: transport, PiP, shuffle/repeat, korektor. `action` wykonuje akcję
// i zamyka dropdown.
defineProps<{ action: (fn: () => void) => void }>();
defineEmits<{ restorePip: []; close: [] }>();

const player = usePlayerStore();
const fx = useAudioFxStore();
</script>

<template>
  <div
    role="menu"
    data-menu="playback"
    class="absolute top-full left-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-2xl shadow-black/40 py-2 min-w-60 z-[70]"
  >
    <AppMenuItem :icon="player.isPlaying ? Pause : Play" @click="action(player.togglePlay)">
      {{ $t('menu.playPause') }}
      <template #hint>{{ $t(player.isPlaying ? 'common.pause' : 'common.play') }}</template>
    </AppMenuItem>
    <AppMenuItem :icon="SkipForward" @click="action(player.nextTrack)">{{
      $t('menu.nextTrack')
    }}</AppMenuItem>
    <AppMenuItem :icon="SkipBack" @click="action(player.prevTrack)">{{
      $t('menu.prevTrack')
    }}</AppMenuItem>
    <AppMenuItem
      v-if="player.currentTrack?.type === 'video' && !player.pipActive && getPlayerPiPHandler()"
      :icon="PictureInPicture"
      @click="
        getPlayerPiPHandler()?.();
        $emit('close');
      "
    >
      {{ $t('menu.picInPic') }}
    </AppMenuItem>
    <AppMenuItem
      v-if="player.currentTrack?.type === 'video' && player.pipActive"
      :icon="PictureInPicture"
      data-testid="menu-return-pip"
      @click="$emit('restorePip')"
    >
      {{ $t('menu.returnFromPip') }}
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="Shuffle" @click="action(player.toggleShuffle)">
      {{ $t('menu.shuffle') }}
      <template #hint>{{ $t(player.shuffle ? 'common.on' : 'common.off') }}</template>
    </AppMenuItem>
    <AppMenuItem :icon="Repeat" @click="action(player.cycleRepeat)">
      {{ $t('menu.repeat') }}
      <template #hint>{{
        $t(
          player.repeat === 'none'
            ? 'player.repeatNone'
            : player.repeat === 'one'
              ? 'player.repeatOne'
              : 'player.repeatAll'
        )
      }}</template>
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="SlidersHorizontal" @click="action(fx.toggleEqualizer)">{{
      $t('menu.eq')
    }}</AppMenuItem>
  </div>
</template>
