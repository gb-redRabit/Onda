// Renderer-side boot marks shown in Diagnostics → Performance, paired with the
// main-process timeline from `diagnostics:getPerf`.

let rendererReadyMs: number | null = null;

export function markRendererReady(): void {
  rendererReadyMs = Math.round(performance.now());
}

export interface RendererBootMetrics {
  domContentLoadedMs: number | null;
  loadMs: number | null;
  rendererReadyMs: number | null;
}

export function getRendererBootMetrics(): RendererBootMetrics {
  const nav = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  return {
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadMs: nav ? Math.round(nav.loadEventEnd) : null,
    rendererReadyMs
  };
}
