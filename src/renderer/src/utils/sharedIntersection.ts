// Jeden współdzielony IntersectionObserver per rootMargin dla całej aplikacji. Listy,
// które nie są wirtualizowane (wyniki online, filmy kanału), tworzyłyby w przeciwnym razie
// jeden observer per karta i odpalały setki callbacków naraz (plan 1.6).
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
 * Obserwuj `el` współdzielonym observerem; `cb` uruchamia się przy każdej zmianie przecięcia.
 * Zwraca funkcję sprzątającą, która przestaje obserwować element.
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
