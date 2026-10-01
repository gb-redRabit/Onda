<script setup lang="ts">
import { computed } from 'vue';
import { BTN_ACTIVE, BTN_EDGE, BTN_PLAY_EDGE } from './pipTheme';

/**
 * The five transport buttons, shared by all three PiP layouts.
 *
 * They were written out three times, once per layout, and had drifted: only the
 * card layout showed the "1" badge for repeat-one, so the same state read
 * differently depending on which dock was in use. The badge now lives in one
 * place and every layout gets it.
 *
 * The layouts still own their own wrapper classes and their `has('controls')`
 * gate — this component only owns the buttons themselves.
 */
const props = withDefaults(
  defineProps<{
    send: (action: string) => void;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: string;
    /** Vertical stacks put play/pause first; the others put it in the middle. */
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
  /** Only repeat-one carries a badge; plain repeat and repeat-off do not. */
  badge: string;
  btnClass: string;
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
          btnClass: props.playBtnClass
        };
      case 'shuffle':
        return { action, glyph: '⇄', active: props.shuffle, badge: '', btnClass: props.btnClass };
      case 'repeat':
        return {
          action,
          glyph: '↻',
          active: props.repeat !== 'none',
          badge: props.repeat === 'one' ? '1' : '',
          btnClass: props.btnClass
        };
      default:
        return {
          action,
          glyph: action === 'prev' ? '⏮' : '⏭',
          active: false,
          badge: '',
          btnClass: props.btnClass
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
      @click.stop="send(b.action)"
    >
      {{ b.glyph }}<span v-if="b.badge" class="-ml-px text-[8px]">{{ b.badge }}</span>
    </button>
  </div>
</template>
