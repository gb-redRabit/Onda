/**
 * Read a `<select>` value as one of the values its options actually offer.
 *
 * The settings selects all typed a raw `.value` cast to `any`, which meant the
 * union on the settings field (`'best' | 'high' | 'medium' | 'low'` and friends)
 * was never actually checked: renaming an option, or a value arriving from a
 * stale settings file, would flow straight into the store and only fail later,
 * somewhere else.
 *
 * `allowed` is the same array the template iterates, so validation and rendering
 * cannot disagree. An unexpected value falls back to the first option instead of
 * poisoning the store.
 */
export function readSelect<T extends string>(event: Event, allowed: readonly T[]): T {
  const value = (event.target as HTMLSelectElement | null)?.value;
  return allowed.includes(value as T) ? (value as T) : allowed[0];
}
