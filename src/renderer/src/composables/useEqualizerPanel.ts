import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioFxStore } from '@renderer/stores/audioFx';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useUIStore } from '@renderer/stores/ui';
import {
  EQUALIZER_PRESETS,
  EQUALIZER_PRESET_LABELS,
  EQ_LIMITS,
  cloneEqBands,
  eqBandColor,
  matchesEqPreset,
  snapFrequency,
  type EqBand,
  type EqBandType
} from '@renderer/utils/constants/audio';
import { sanitizeEqBands, sanitizeEqPreamp } from '@shared/eqSanitize';
import { eqCurvePath, ratioToFreq } from '@renderer/utils/eqCurve';
import { EQ_CURVE as CURVE, bandY, dbToY } from '@renderer/utils/eqGeometry';
import { useEqSpectrum } from '@renderer/composables/useEqSpectrum';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';

// Logika panelu equalizera: krzywa, przeciąganie pasm, presety, solo oraz
// eksport/import. Wydzielona z `Equalizer.vue`, aby komponent został warstwą
// prezentacji (szablon + ikony).
//
// Refy DOM (`panel`, `curveEl`) należą do komponentu, bo wiąże je `ref="..."` w
// szablonie — composable dostaje je gotowe i nie tworzy własnych.
export interface EqualizerPanelRefs {
  panel: Ref<HTMLElement | null>;
  curveEl: Ref<HTMLElement | null>;
}

export function useEqualizerPanel(refs: EqualizerPanelRefs) {
  const { panel, curveEl } = refs;
  const player = usePlayerStore();
  const fx = useAudioFxStore();
  const audio = useAudioPlayer();
  const ui = useUIStore();
  const prompt = usePromptDialog();
  const { applyEqBands } = audio;
  const { t } = useI18n();

  const showControls = ref(true);
  const menuBand = ref<number | null>(null);

  function onClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    if (menuBand.value !== null) menuBand.value = null;
    if (
      panel.value &&
      !panel.value.contains(target) &&
      !(target as HTMLElement).closest('[data-eq-toggle]')
    ) {
      fx.equalizerVisible = false;
    }
  }
  onMounted(() => document.addEventListener('click', onClickOutside));
  onUnmounted(() => document.removeEventListener('click', onClickOutside));

  const bandTypes: EqBandType[] = ['lowshelf', 'peaking', 'highshelf'];
  const limits = EQ_LIMITS;
  const presetLabels: Record<string, string> = {
    ...EQUALIZER_PRESET_LABELS,
    classical: t('equalizer.classical'),
    bassBoost: t('equalizer.bass'),
    trebleBoost: t('equalizer.treble'),
    vocal: t('equalizer.vocal')
  };

  const bands = computed(() => fx.equalizerBands);
  const color = (i: number) => (fx.equalizerMulticolor ? eqBandColor(i) : 'var(--color-primary)');
  const snap = (freq: number) => (fx.equalizerSnap ? snapFrequency(freq) : freq);

  // „Solo": odsłuchaj tylko jedno pasmo (reszta neutralna) — zmiana tylko na grafie, bez zapisu.
  const solo = ref<number | null>(null);
  function applySoloGraph() {
    const list =
      solo.value !== null && bands.value[solo.value] ? [bands.value[solo.value]] : bands.value;
    audio.applyEqGraph(list);
  }
  function toggleSolo(i: number) {
    solo.value = solo.value === i ? null : i;
    applySoloGraph();
  }
  watch(bands, () => {
    if (solo.value !== null) applySoloGraph();
  });

  const userPresets = computed(() => fx.equalizerUserPresets ?? {});
  const activePreset = computed(() => {
    for (const name of Object.keys(userPresets.value)) {
      if (matchesEqPreset(bands.value, userPresets.value[name])) return name;
    }
    for (const name of Object.keys(EQUALIZER_PRESETS)) {
      if (matchesEqPreset(bands.value, EQUALIZER_PRESETS[name])) return name;
    }
    return 'custom';
  });

  // --- krzywa ---
  const curvePath = computed(() => eqCurvePath(bands.value, CURVE, fx.equalizerPreamp));
  const zeroLineY = dbToY(0);

  // spektrum na żywo
  const { spectrumPath } = useEqSpectrum({
    isPlaying: () => player.isPlaying,
    getAnalyser: () => audio.getAnalyserNode(),
    getSampleRate: () => audio.getAudioContext()?.sampleRate ?? 48000
  });

  const draggingBand = ref<number | null>(null);
  const hoverBand = ref<number | null>(null);
  // Menu kontekstowe otwiera się w dół, gdy kropka jest w górnej połowie, i w górę w dolnej —
  // dzięki temu nigdy nie wychodzi poza wykres.
  const menuBelow = computed(() =>
    menuBand.value === null
      ? true
      : bandY((bands.value[menuBand.value]?.gain ?? 0) + fx.equalizerPreamp) < 55
  );

  function timeFromEvent(e: PointerEvent | MouseEvent): { frequency: number; gain: number } | null {
    const el = curveEl.value;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return {
      frequency: Math.round(snap(ratioToFreq(rx, CURVE.minFreq, CURVE.maxFreq))),
      gain: Math.round(CURVE.maxDb - ry * (CURVE.maxDb - CURVE.minDb) - fx.equalizerPreamp)
    };
  }
  function onCurveDown(i: number, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    draggingBand.value = i;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onCurveMove(e: PointerEvent) {
    if (draggingBand.value === null) return;
    const pt = timeFromEvent(e);
    if (pt) patchBand(draggingBand.value, pt);
  }
  function onCurveUp() {
    draggingBand.value = null;
  }
  // dwuklik w puste miejsce = dodaj pasmo w tym punkcie
  function onCurveDblClick(e: MouseEvent) {
    if (bands.value.length >= limits.maxBands) return;
    const pt = timeFromEvent(e);
    if (!pt) return;
    const next = cloneEqBands(bands.value);
    next.push({ type: 'peaking', frequency: pt.frequency, q: 1, gain: pt.gain });
    commit(next);
  }
  function onMarkerDblClick(i: number) {
    patchBand(i, { gain: 0 });
  }
  function onMarkerContext(e: MouseEvent, i: number) {
    e.preventDefault();
    menuBand.value = menuBand.value === i ? null : i;
  }

  function commit(next: EqBand[], preset = 'custom') {
    fx.equalizerPreset = preset;
    applyEqBands(next);
  }
  function selectPreset(name: string) {
    const src = userPresets.value[name] ?? EQUALIZER_PRESETS[name];
    if (src) commit(cloneEqBands(src), name);
  }
  function patchBand(i: number, patch: Partial<EqBand>) {
    const next = cloneEqBands(bands.value);
    if (!next[i]) return;
    next[i] = { ...next[i], ...patch };
    commit(next);
  }
  function setType(i: number, type: EqBandType) {
    patchBand(i, { type });
    menuBand.value = null;
  }
  function addBand() {
    if (bands.value.length >= limits.maxBands) return;
    const next = cloneEqBands(bands.value);
    next.push({ type: 'peaking', frequency: 1000, q: 1, gain: 0 });
    commit(next);
  }
  function removeBand(i: number) {
    if (bands.value.length <= 1) return;
    const next = cloneEqBands(bands.value);
    next.splice(i, 1);
    commit(next);
    menuBand.value = null;
  }
  function typeLabel(type: EqBandType): string {
    return t(`equalizer.type_${type}`);
  }

  // --- własne presety + eksport/import ---
  // Nazwę zbieramy we własnym polu w panelu, bo `window.prompt()` nie jest obsługiwane
  // w Electronie (rzuca „prompt() is and will not be supported") — wcześniej zapis presetu
  // był martwą funkcją, a domyślna nazwa mogła nadpisać istniejący preset bez ostrzeżenia.
  const naming = ref(false);
  const presetName = ref('');
  const canSavePreset = computed(() => {
    const name = presetName.value.trim();
    if (!name) return false;
    return !(name in userPresets.value) && !(name in EQUALIZER_PRESETS);
  });
  function savePreset() {
    presetName.value = `${t('equalizer.custom')} ${Object.keys(userPresets.value).length + 1}`;
    naming.value = true;
  }
  function confirmSavePreset() {
    const name = presetName.value.trim();
    if (!name) return;
    if (name in userPresets.value || name in EQUALIZER_PRESETS) {
      ui.notify('error', t('equalizer.savePreset'), t('equalizer.presetExists'));
      return;
    }
    audio.setEqUserPresets({ ...userPresets.value, [name]: cloneEqBands(bands.value) });
    naming.value = false;
    presetName.value = '';
  }
  async function deletePreset(name: string) {
    if (!(await prompt.showConfirm(t('equalizer.presetDeleteConfirm', { name })))) return;
    const next = { ...userPresets.value };
    delete next[name];
    audio.setEqUserPresets(next);
  }
  async function exportEq() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ bands: bands.value, preamp: fx.equalizerPreamp })
      );
    } catch {
      ui.notify('error', t('equalizer.export'), t('equalizer.exportError'));
    }
  }
  async function importEq() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as { bands?: unknown; preamp?: unknown };
      const importedBands = sanitizeEqBands(parsed.bands);
      if (!importedBands || importedBands.length === 0) {
        ui.notify('error', t('equalizer.import'), t('equalizer.importError'));
        return;
      }
      commit(importedBands);
      const preamp = sanitizeEqPreamp(parsed.preamp);
      if (preamp !== undefined) audio.setEqPreamp(preamp);
    } catch {
      ui.notify('error', t('equalizer.import'), t('equalizer.importError'));
    }
  }

  return {
    showControls,
    menuBand,
    fx,
    audio,
    prompt,
    bandTypes,
    limits,
    presetLabels,
    bands,
    color,
    snap,
    solo,
    toggleSolo,
    userPresets,
    activePreset,
    curvePath,
    zeroLineY,
    spectrumPath,
    draggingBand,
    hoverBand,
    menuBelow,
    onCurveDown,
    onCurveMove,
    onCurveUp,
    onCurveDblClick,
    onMarkerDblClick,
    onMarkerContext,
    commit,
    selectPreset,
    patchBand,
    setType,
    addBand,
    removeBand,
    typeLabel,
    naming,
    presetName,
    canSavePreset,
    savePreset,
    confirmSavePreset,
    deletePreset,
    exportEq,
    importEq
  };
}
