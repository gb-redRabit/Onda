<script setup lang="ts">
import { ref } from 'vue';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';

/**
 * Teleport, backdrop and dialog panel for the modal components.
 *
 * Eleven dialogs each wrote this out by hand, and the copies had drifted: two
 * different z-index values (9999 and 10000), two backdrop opacities, and one
 * dialog whose `aria-labelledby` pointed at an id it no longer rendered. The
 * a11y attributes and the focus trap now live here, so a dialog cannot ship
 * without them — `useDialogFocus` needs the panel ref, and the panel ref lives
 * on this element.
 *
 * The visual parts stay the caller's: panel size, header and footer are all
 * slots, because the eleven dialogs disagree on all three and forcing them to
 * agree would change how they look.
 *
 * Only OnlineConfirmDialog has been migrated so far. The others each need
 * something the shell does not expose yet — ExplorerPromptDialog is addressed by
 * `data-testid` from E2E and brings its own Escape handling, others size their
 * own panel from a prop — so they were left alone rather than half-migrated.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Rendered only when true; the parent controls open/close. */
    visible?: boolean;
    /**
     * Accessible name of the dialog. Pass an id that an element inside the
     * default slot carries, so the name is read from the visible heading.
     */
    labelledBy?: string;
    /** Backdrop dimming, matching the caller's previous look. */
    backdrop?: 'dim' | 'dim-blur';
      /** Extra classes for the panel, e.g. its width and padding. */
      panelClass?: string;
      /** Close when the backdrop itself is clicked. */
      dismissOnBackdrop?: boolean;
      /**
       * Whether Escape emits `escape` (which the caller usually maps to close).
       * Set false for a dialog that handles Escape itself, so it is not handled
       * twice.
       */
      closeOnEscape?: boolean;
      /** `data-testid` for the backdrop element (the panel takes it via $attrs). */
      backdropTestid?: string;
      /** Panel surface: `base` (base-100, default) or `neutral`. */
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

// Focus enters the dialog on open, cycles inside it, and returns to the opener
// on close. Escape emits `escape` rather than `close` so a dialog that must not
// be dismissed (a wizard step with unsaved input) can refuse it.
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
