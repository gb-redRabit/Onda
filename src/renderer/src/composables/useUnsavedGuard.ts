import { onBeforeUnmount } from 'vue';

/**
 * Zabezpieczenie "kliknij poza dwa razy, aby zamknąć" dla dialogów z edytowalnymi polami.
 *
 * Trzy dialogi nosiły własną kopię tego: licznik kliknięć, timer resetu,
 * sprawdzenie dirty i dwa powiadomienia. Rozjechały się — edytor tagów
 * używał okna 2,5 s, gdzie pozostałe używały 2 s, i powiadamiał tylko przy
 * pierwszym kliknięciu, gdy dwa pozostałe powiadamiały przy obu, w tym przy kliknięciu
 * zamykającym dialog. Różnice są teraz nazwanymi opcjami zamiast
 * trzech subtelnie różnych ręcznie pisanych wersji.
 */
export interface UnsavedGuardOptions {
  /** Przeliczane przy każdym kliknięciu, więc musi czytać bieżący stan, nie snapshot. */
  isDirty: () => boolean;
  /** Wywoływane przy kliknięciu, które faktycznie zamyka. */
  onClose: () => void;
  /** Ostrzeżenie pokazywane, gdy formularz ma niezapisane zmiany. */
  onDirtyHint: () => void;
  /** Informacja pokazywana, gdy formularz jest czysty. */
  onCleanHint: () => void;
  /** Kliknięcia w tym oknie względem siebie liczą się jako para. */
  windowMs?: number;
  /**
   * Dłuższe okno po kliknięciu na brudnym formularzu: użytkownik właśnie zobaczył ostrzeżenie, więc dajmy
   * mu więcej czasu na decyzję i ponowne kliknięcie.
   */
  dirtyWindowMs?: number;
  /**
   * Gdy true, kliknięcie zamykające również wywołuje podpowiedź. Edytor tagów podpowiada
   * tylko przy kliknięciu, które *nie* zamyka, ponieważ dialog już zniknął, zanim
   * użytkownik przeczyta drugą wiadomość.
   */
  notifyOnClosingClick?: boolean;
}

export function useUnsavedGuard(options: UnsavedGuardOptions) {
  const {
    isDirty,
    onClose,
    onDirtyHint,
    onCleanHint,
    windowMs = 2000,
    dirtyWindowMs = windowMs,
    notifyOnClosingClick = true
  } = options;

  let clicks = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function reset(): void {
    clicks = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onOverlayClick(): void {
    const dirty = isDirty();
    clicks++;

    if (clicks >= 2) {
      // Licznik resetuje się przed zamknięciem, więc ponowne otwarcie startuje od czystej karty.
      reset();
      if (notifyOnClosingClick) (dirty ? onDirtyHint : onCleanHint)();
      onClose();
      return;
    }

    (dirty ? onDirtyHint : onCleanHint)();
    if (timer) clearTimeout(timer);
    timer = setTimeout(reset, dirty ? dirtyWindowMs : windowMs);
  }

  onBeforeUnmount(reset);

  return { onOverlayClick, reset };
}
