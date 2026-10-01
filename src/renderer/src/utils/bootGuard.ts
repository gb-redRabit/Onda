/**
 * Runs a single boot step and reports a failure instead of letting it abort the
 * rest of the mount. The renderer MUST always reach `app:rendererReady`; a
 * thrown error before it leaves the splash up until the 30s watchdog (see
 * `BOOT_WATCHDOG_DEADLINE_MS` in `src/main/index.ts`). Guarding each step also
 * means one failure does not skip the steps after it.
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
