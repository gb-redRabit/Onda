<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue';
import { cn } from '@renderer/utils/cn';

// Pole czasu `mm:ss` (lub `h:mm:ss` powyżej godziny) trzymające model w
// sekundach. Wpisanie samych sekund też działa, więc dotychczasowe nawyki
// (`300`) nie znikają. Błędny zapis nie nadpisuje modelu — pole tylko sygnalizuje
// błąd, a po opuszczeniu wraca do ostatniej poprawnej wartości.
const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    invalid?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { size: 'md' }
);

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});

const text = ref(format(props.modelValue));
const parseFailed = ref(false);

function format(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function parse(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const clock = trimmed.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    const c = clock[3] === undefined ? null : Number(clock[3]);
    return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return 'invalid';
}

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parse(text.value);
    if (parsed === 'invalid' || parsed !== value) {
      text.value = format(value);
      parseFailed.value = false;
    }
  }
);

function onInput(): void {
  const parsed = parse(text.value);
  if (parsed === 'invalid') {
    parseFailed.value = true;
    return;
  }
  parseFailed.value = false;
  if (parsed !== props.modelValue) emit('update:modelValue', parsed);
}

function onBlur(): void {
  if (parseFailed.value) {
    text.value = format(props.modelValue);
    parseFailed.value = false;
    return;
  }
  // Normalizuj zapis (np. "5" → "00:05") po opuszczeniu pola.
  const parsed = parse(text.value);
  if (parsed !== 'invalid') text.value = format(parsed);
}

const isInvalid = computed(() => props.invalid || parseFailed.value);

const classes = computed(() =>
  cn(
    'w-full rounded-field border bg-base-200/70 font-mono tabular-nums text-base-content transition-colors placeholder:text-base-content/50 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
    props.size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
    isInvalid.value
      ? 'border-error focus:border-error focus:ring-error/20'
      : 'border-base-300/80 focus:border-primary/50'
  )
);
</script>

<template>
  <input
    v-bind="rest"
    v-model="text"
    type="text"
    inputmode="numeric"
    :class="classes"
    :aria-invalid="isInvalid || undefined"
    placeholder="mm:ss"
    @input="onInput"
    @blur="onBlur"
  />
</template>
