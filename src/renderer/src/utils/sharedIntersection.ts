// One shared IntersectionObserver per rootMargin for the whole app. Lists that
// are not virtualized (online results, channel videos) would otherwise create
// one observer per card and fire hundreds of callbacks at once (plan 1.6).
const observers = new Map<string, IntersectionObserver>();
const handlers = new WeakMap<Element, (isIntersecting: boolean) => void>();

function getObserver(rootMargin: string): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null;
  let observer = observers.get(rootMargin);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          handlers.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin }
    );
    observers.set(rootMargin, observer);
  }
  return observer;
}

/**
 * Observe `el` with the shared observer; `cb` runs on every intersection change.
 * Returns a cleanup function that unobserves the element.
 */
export function observeIntersection(
  el: Element,
  cb: (isIntersecting: boolean) => void,
  rootMargin = '0px'
): () => void {
  const observer = getObserver(rootMargin);
  if (!observer) return () => {};
  handlers.set(el, cb);
  observer.observe(el);
  return () => {
    handlers.delete(el);
    observer.unobserve(el);
  };
}
