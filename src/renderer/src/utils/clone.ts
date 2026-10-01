/**
 * Deep-clones a value for IPC or persistence. `structuredClone` is preferred
 * (native, no JSON round-trip, keeps types like Uint8Array and Date), but it
 * rejects Vue reactive proxies and some host objects, so a JSON round-trip is
 * the fallback. Use this instead of ad-hoc `JSON.parse(JSON.stringify(...))`.
 */
export function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
