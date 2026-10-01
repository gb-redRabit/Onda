<script setup lang="ts">
import { ref } from 'vue';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';

/**
 * Teleport, backdrop i panel dialogowy dla komponentów modalnych.
 *
 * Jedenaście dialogów pisało to ręcznie, a kopie się rozjechały: dwie
 * różne wartości z-index (9999 i 10000), dwie przezroczystości backdropu i jeden
 * dialog, którego `aria-labelledby` wskazywał na id, którego już nie renderował.
 * Atrybuty a11y i pułapka focusu są teraz tutaj, więc dialog nie może zostać
 * wydany bez nich — `useDialogFocus` potrzebuje refa panelu, a ten ref żyje
 * na tym elemencie.
 *
 * Części wizualne pozostają po stronie wywołującego: rozmiar panelu, nagłówek
 * i stopka to sloty, ponieważ jedenaście dialogów nie zgadza się co do wszystkich
 * trzech i zmuszenie ich do zgodności zmieniłoby ich wygląd.
 *
 * Na razie zmigrowano tylko OnlineConfirmDialog. Pozostałe potrzebują czegoś,
 * czego shell jeszcze nie wystawia — ExplorerPromptDialog jest adresowany przez
 * `data-testid` z E2E i przynosi własną obsługę Escape, inne ustawiają własny
 * rozmiar panelu z propsa — więc pozostawiono je same, zamiast migrować połowicznie.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Renderowany tylko, gdy true; rodzic kontroluje otwarcie/zamknięcie. */
    visible?: boolean;
    /**
     * Dostępna nazwa dialogu. Przekaż id, które nosi element wewnątrz
     * domyślnego slotu, aby nazwa była czytana z widocznego nagłówka.
     */
    labelledBy?: string;
    /** Przyciemnienie backdropu, zgodne z poprzednim wyglądem wywołującego. */
    backdrop?: 'dim' | 'dim-blur';
      /** Dodatkowe klasy panelu, np. jego szerokość i padding. */
      panelClass?: string;
      /** Zamknij, gdy kliknięto sam backdrop. */
      dismissOnBackdrop?: boolean;
      /**
       * Czy Escape emituje `escape` (które wywołujący zwykle mapuje na zamknięcie).
       * Ustaw false dla dialogu, który sam obsługuje Escape, aby nie był
       * obsługiwany dwukrotnie.
       */
      closeOnEscape?: boolean;
      /** `data-testid` dla elementu backdropu (panel bierze go przez $attrs). */
      backdropTestid?: string;
      /** Powierzchnia panelu: `base` (base-100, domyślnie) lub `neutral`. */
      panelTone?: 'base' | 'neutral';
    }>(),
    {
      visible: true,
      backdrop: 'dim',
      panelClass: '',
      dismissOnBackdrop: true,
      closeOnEscape: true,
      backdropTestid: undefined,
      panelTone: 'base'
    }
  );

const emit = defineEmits<{
  close: [];
  escape: [];
}>();

const panelRef = ref<HTMLElement | null>(null);

// Focus wchodzi do dialogu przy otwarciu, krąży w nim i wraca do elementu
// otwierającego przy zamknięciu. Escape emituje `escape`, a nie `close`, aby
// dialog, którego nie wolno zamknąć (krok kreatora), mógł je odrzucić.
useDialogFocus(panelRef, {
  closeOnEscape: props.closeOnEscape,
  onEscape: () => emit('escape')
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-10000 flex items-center justify-center p-4"
      :class="backdrop === 'dim-blur' ? 'bg-neutral/60 backdrop-blur-sm' : 'bg-neutral/50'"
      :data-testid="props.backdropTestid"
      @click.self="dismissOnBackdrop && emit('close')"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="props.labelledBy || undefined"
        tabindex="-1"
        class="border border-base-300 rounded-box shadow-2xl"
        :class="[panelTone === 'neutral' ? 'bg-neutral' : 'bg-base-100', panelClass]"
        v-bind="$attrs"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
