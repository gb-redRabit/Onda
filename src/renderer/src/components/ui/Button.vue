<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';
import Spinner from './Spinner.vue';
import {
  buttonBase,
  buttonSizes,
  buttonVariants,
  type ButtonSize,
  type ButtonVariant
} from './variants/button';

// `class` z zewnątrz przechodzi przez `cn`, więc może nadpisać padding wariantu.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    /** Wymagane dla `size="icon"` — inaczej przycisk nie ma nazwy. */
    label?: string;
  }>(),
  { variant: 'solid', size: 'md', type: 'button' }
);

const attrs = useAttrs();

if (import.meta.env.DEV && props.size === 'icon' && !props.label) {
  console.warn('[ui/Button] size="icon" requires a label (aria-label).');
}

const classes = computed(() =>
  cn(
    buttonBase,
    buttonVariants[props.variant],
    buttonSizes[props.size],
    attrs.class as string | undefined
  )
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <button
    v-bind="rest"
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :aria-label="label"
  >
    <Spinner v-if="loading" :size="size === 'lg' ? 18 : 15" class="absolute" />
    <span class="inline-flex items-center [gap:inherit]" :class="{ 'opacity-0': loading }">
      <slot name="leading" />
      <slot />
      <slot name="trailing" />
    </span>
  </button>
</template>
