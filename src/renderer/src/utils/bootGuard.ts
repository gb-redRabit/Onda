/**
 * Uruchamia pojedynczy krok startu i zgłasza błąd, zamiast pozwolić mu przerwać
 * resztę montowania. Renderer MUSI zawsze dotrzeć do `app:rendererReady`; błąd
 * rzucony przed tym zostawia splash na ekranie aż do watchdoga 30s (patrz
 * `BOOT_WATCHDOG_DEADLINE_MS` w `src/main/index.ts`). Pilnowanie każdego kroku
 * sprawia też, że jedna awaria nie pomija kroków po niej.
 */
export async function guardBootStep(
  run: () => Promise<void> | void,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    await run();
  } catch (error) {
    onError(error);
  }
}
