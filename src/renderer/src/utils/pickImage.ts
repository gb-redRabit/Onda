/**
 * Ask the main process for an image and return the chosen path.
 *
 * Three components opened the image picker and then each re-implemented the
 * same unwrapping of the dialog result: bail out when the user cancelled, bail
 * out when no path came back, otherwise take the first one. The result type is
 * declared per call site with an inline cast, so a change to the IPC shape would
 * have broken each of them separately.
 *
 * Returns null when the dialog is unavailable (no preload bridge), cancelled, or
 * returns nothing usable.
 */
export async function pickImagePath(): Promise<string | null> {
  const result = await window.api?.openImageDialog();
  if (!result || result.canceled) return null;
  return result.filePaths?.[0] ?? null;
}
