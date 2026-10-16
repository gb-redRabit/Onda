<script setup lang="ts">
import { computed } from 'vue';
import { BTN_ACTIVE, BTN_EDGE, BTN_PLAY_EDGE } from './pipTheme';

/**
 * Pięć przycisków transportu, współdzielonych przez wszystkie trzy układy PiP.
 *
 * Były wypisane trzy razy, po jednym na układ, i się rozjechały: tylko układ
 * karty pokazywał plakietkę "1" dla powtarzania jednego, więc ten sam stan czytał się
 * różnie w zależności od używanej doki. Plakietka żyje teraz w jednym
 * miejscu i każdy układ ją dostaje.
 *
 * Układy nadal mają własne klasy wrapperów i własną bramkę
 * `has('controls')` — ten komponent posiada tylko same przyciski.
 */
const props = withDefaults(
  defineProps<{
    send: (action: string) => void;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: string;
    /** Pionowe stosy dają play/pause na początku; pozostałe w środku. */
    layout?: 'horizontal' | 'vertical';
    btnClass?: string;
    playBtnClass?: string;
  }>(),
  {
    layout: 'horizontal',
    btnClass: BTN_EDGE,
    playBtnClass: BTN_PLAY_EDGE
  }
);

const HORIZONTAL = ['shuffle', 'prev', 'playPause', 'next', 'repeat'] as const;
const VERTICAL = ['playPause', 'prev', 'next', 'shuffle', 'repeat'] as const;

interface TransportButton {
  action: string;
  glyph: string;
  active: boolean;
  /** Tylko powtarzanie jednego nosi plakietkę; zwykłe powtarzanie i wyłączone nie. */
  badge: string;
  btnClass: string;
  /** Dostępna nazwa dla czytnika ekranu (glify same nie niosą treści). */
  label: string;
  /** Czy przycisk jest przełącznikiem (shuffle/repeat) — dla `aria-pressed`. */
  toggle: boolean;
}

const buttons = computed<TransportButton[]>(() => {
  const order = props.layout === 'vertical' ? VERTICAL : HORIZONTAL;
  return order.map((action) => {
    switch (action) {
      case 'playPause':
        return {
          action,
          glyph: props.isPlaying ? '⏸' : '▶',
          active: false,
          badge: '',
          btnClass: props.playBtnClass,
          label: props.isPlaying ? 'Pause' : 'Play',
          toggle: false
        };
      case 'shuffle':
        return {
          action,
          glyph: '⇄',
          active: props.shuffle,
          badge: '',
          btnClass: props.btnClass,
          label: 'Shuffle',
          toggle: true
        };
      case 'repeat':
        return {
          action,
          glyph: '↻',
          active: props.repeat !== 'none',
          badge: props.repeat === 'one' ? '1' : '',
          btnClass: props.btnClass,
          label: props.repeat === 'one' ? 'Repeat one' : 'Repeat',
          toggle: true
        };
      default:
        return {
          action,
          glyph: action === 'prev' ? '⏮' : '⏭',
          active: false,
          badge: '',
          btnClass: props.btnClass,
          label: action === 'prev' ? 'Previous' : 'Next',
          toggle: false
        };
    }
  });
});
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-1"
    :class="layout === 'vertical' ? 'flex-col' : ''"
    @dblclick.stop
  >
    <button
      v-for="b in buttons"
      :key="b.action"
      :data-testid="'pip-' + b.action"
      :class="[b.btnClass, b.active ? BTN_ACTIVE : '']"
      :aria-label="b.label"
      :aria-pressed="b.toggle ? b.active : undefined"
      @click.stop="send(b.action)"
    >
      {{ b.glyph }}<span v-if="b.badge" class="-ml-px text-[8px]">{{ b.badge }}</span>
    </button>
  </div>
</template>
