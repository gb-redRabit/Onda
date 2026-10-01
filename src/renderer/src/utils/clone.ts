/**
 * Głęboko klonuje wartość na potrzeby IPC lub trwałości. Preferowany jest
 * `structuredClone` (natywny, bez rundy przez JSON, zachowuje typy takie jak Uint8Array i Date),
 * ale odrzuca reaktywne proxy Vue i niektóre obiekty hosta, więc fallbackiem jest
 * runda przez JSON. Używaj tego zamiast doraźnego `JSON.parse(JSON.stringify(...))`.
 */
export function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
