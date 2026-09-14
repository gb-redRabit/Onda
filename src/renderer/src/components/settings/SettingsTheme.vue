<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { storeToRefs } from 'pinia';
import { getThemeEngine } from '@renderer/composables/useTheme';
import {
  resolveThemeAppearance,
  BUILTIN_THEME_NAMES,
  type BuiltinThemeName
} from '@shared/builtin-themes';
import { COLOR_TOKEN_IDS, tokenToCssVar, sanitizeHex, type ColorTokenId } from '@shared/themeModel';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsThemePicker from '@renderer/components/settings/SettingsThemePicker.vue';
import SettingsThemeGeometry from '@renderer/components/settings/SettingsThemeGeometry.vue';
import {
  BASE_TOKENS,
  BRAND_TOKENS,
  STATUS_TOKENS,
  PREVIEW_TOKENS
} from '@renderer/utils/themeTokens';

const settings = useSettingsStore();
const { appearance: settingsAppearanceRef } = storeToRefs(settings);
const { t } = useI18n();
const engine = getThemeEngine(settingsAppearanceRef);

const isCustom = computed(() => settings.appearance.theme === 'custom');
const resolved = computed(() => resolveThemeAppearance(settings.appearance));

function tokenLabel(id: ColorTokenId): string {
  return t(`creator.tokens.${id}`);
}

function colorValue(id: ColorTokenId): string {
  return settings.appearance.customColors?.[id] ?? resolved.value.colors[id];
}

function updateColor(id: ColorTokenId, hex: string) {
  const clean = sanitizeHex(hex);
  if (!clean) return;
  settings.updateAppearance({
    customColors: { ...settings.appearance.customColors, [id]: clean }
  });
  engine.applyPreviewVars({ [tokenToCssVar(id)]: clean });
}

function setScheme(seed: BuiltinThemeName) {
  settings.updateAppearance({ customBase: seed });
}

function toggleAcrylic(enabled: boolean) {
  window.api?.invoke('app:setBackgroundMaterial', enabled ? 'acrylic' : 'auto');
}

function resetCustom(seed: 'dark' | 'light') {
  settings.updateAppearance({ customBase: seed, customColors: {} });
  engine.reapplyTheme();
}

async function copyThemeJson() {
  try {
    const payload = JSON.stringify(
      {
        base: settings.appearance.customBase ?? 'dark',
        colors: settings.appearance.customColors ?? {}
      },
      null,
      2
    );
    await navigator.clipboard.writeText(payload);
  } catch {
    /* clipboard unavailable */
  }
}

async function pasteThemeJson() {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = JSON.parse(text) as { base?: string; colors?: Record<string, string> };
    const colors: Record<string, string> = {};
    for (const id of COLOR_TOKEN_IDS) {
      const hex = sanitizeHex(parsed.colors?.[id]);
      if (hex) colors[id] = hex;
    }
    settings.updateAppearance({
      theme: 'custom',
      customBase: parsed.base === 'light' ? 'light' : 'dark',
      customColors: colors
    });
  } catch {
    /* invalid json or clipboard unavailable */
  }
}
</script>

<template>
  <SettingsPanel :title="$t('settings.themeTab')">
    <div class="flex flex-col xl:flex-row gap-8">
      <SettingsThemePicker />

      <div class="flex-1 min-w-0 flex flex-col gap-8">
        <div
          class="rounded-box border border-base-300 bg-base-200/[var(--glass-alpha)] p-5 flex flex-wrap items-end gap-3"
        >
          <div v-for="id in PREVIEW_TOKENS" :key="id" class="flex flex-col items-center gap-1.5">
            <span
              class="w-11 h-11 rounded-box border shadow-sm"
              :style="{
                backgroundColor: resolved.colors[id],
                borderColor: resolved.colors.base300
              }"
              :title="`${tokenLabel(id)} ${resolved.colors[id]}`"
            />
            <span class="text-[10px] font-mono text-base-content/50">{{
              resolved.colors[id]
            }}</span>
          </div>
        </div>

        <template v-if="isCustom">
          <section>
            <h3 class="text-sm font-semibold mb-3">{{ $t('creator.scheme') }}</h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="seed in BUILTIN_THEME_NAMES"
                :key="seed"
                class="fx-noise px-4 py-2 fx-depth rounded-field text-sm border transition-colors"
                :class="
                  (settings.appearance.customBase ?? 'dark') === seed
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-base-300 text-base-content/70 hover:bg-base-content/10'
                "
                @click="setScheme(seed)"
              >
                {{ $t(`settings.${seed}`) }}
              </button>
            </div>
          </section>

          <section v-for="(group, gi) in [BASE_TOKENS, BRAND_TOKENS, STATUS_TOKENS]" :key="gi">
            <h3 class="text-sm font-semibold mb-3">
              {{ $t(['creator.baza', 'creator.brand', 'creator.statuses'][gi]) }}
            </h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-3">
              <label
                v-for="id in group"
                :key="id"
                class="flex items-center gap-4 py-1 cursor-pointer group"
              >
                <input
                  type="color"
                  class="w-11 h-10 fx-depth rounded-field bg-transparent border border-base-300 cursor-pointer shrink-0"
                  :value="colorValue(id)"
                  @input="updateColor(id, ($event.target as HTMLInputElement).value)"
                />
                <span class="text-sm flex-1 min-w-0 truncate">{{ tokenLabel(id) }}</span>
                <input
                  type="text"
                  class="w-28 px-2.5 py-1.5 fx-depth rounded-field bg-base-200 border border-base-300 text-xs font-mono text-base-content/70 focus:border-primary/50 focus:outline-none"
                  :value="colorValue(id)"
                  @change="updateColor(id, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-semibold mb-3">{{ $t('creator.actions') }}</h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="act in ['seedDark', 'seedLight', 'copy', 'paste']"
                :key="act"
                class="fx-noise px-4 py-2 fx-depth rounded-field text-sm border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors"
                @click="
                  act === 'seedDark'
                    ? resetCustom('dark')
                    : act === 'seedLight'
                      ? resetCustom('light')
                      : act === 'copy'
                        ? copyThemeJson()
                        : pasteThemeJson()
                "
              >
                {{ $t(`creator.${act}`) }}
              </button>
            </div>
          </section>
        </template>

        <p v-else class="text-sm text-base-content/60 -mt-2">
          {{ $t('creator.builtinHint') }}
        </p>

        <SettingsThemeGeometry />

        <section>
          <h3 class="text-sm font-semibold mb-3">{{ $t('creator.glass') }}</h3>
          <div class="flex justify-between text-xs text-base-content/60 mb-1.5">
            <span>{{ settings.appearance.glassAlpha ?? 100 }}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            :value="settings.appearance.glassAlpha ?? 100"
            class="w-full"
            @input="
              settings.updateAppearance({
                glassAlpha: parseInt(($event.target as HTMLInputElement).value)
              });
              toggleAcrylic(parseInt(($event.target as HTMLInputElement).value) < 100);
            "
          />
          <p class="mt-2 text-xs text-base-content/50">{{ $t('creator.glassHint') }}</p>
        </section>
      </div>
    </div>
  </SettingsPanel>
</template>
