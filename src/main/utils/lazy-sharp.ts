// `sharp` to natywny libvips — ładowany przy pierwszym użyciu, a nie przy starcie
// procesu main. Moduł ładuje się raz; kolejne wywołania dostają tę samą instancję.
let sharpPromise: Promise<typeof import('sharp').default> | null = null;

export function loadSharp(): Promise<typeof import('sharp').default> {
  if (!sharpPromise) sharpPromise = import('sharp').then((mod) => mod.default);
  return sharpPromise;
}
