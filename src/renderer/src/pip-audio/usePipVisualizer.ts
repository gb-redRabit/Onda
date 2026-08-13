import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export function usePipVisualizer(vizData: Ref<number[]>) {
  const vizCanvas = ref<HTMLCanvasElement | null>(null);
  let vizAnimId = 0;
  let vizIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let vizPaused = false;
  let vizSmooth: number[] = Array(10).fill(0);
  let vizPeaks: number[] = Array(10).fill(0);
  let cachedAccent = '#7c6aef';
  let barGeom: { x: number; bw: number }[] = [];
  let cachedW = 0;
  let cachedCount = 0;

  function ensureGeom(w: number, count: number) {
    if (w === cachedW && count === cachedCount && barGeom.length === count) return;
    const barW = w / count;
    const gap = 0.5;
    barGeom = Array.from({ length: count }, (_, i) => ({
      x: i * barW + gap / 2,
      bw: Math.max(1, barW - gap)
    }));
    cachedW = w;
    cachedCount = count;
  }

  function scheduleVizIdle(): void {
    if (vizIdleTimer) return;
    vizIdleTimer = setTimeout(() => {
      vizIdleTimer = null;
      drawViz();
    }, 500);
  }

  function drawViz() {
    const canvas = vizCanvas.value;
    if (!canvas || !canvas.isConnected) {
      scheduleVizIdle();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      scheduleVizIdle();
      return;
    }
    const parent = canvas.parentElement;
    if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
    const w = canvas.width;
    const h = canvas.height;
    const data = vizData.value;
    if (data.length < 4) {
      scheduleVizIdle();
      return;
    }

    const accent = cachedAccent;
    const count = 192;
    ensureGeom(w, count);
    const cx = h / 2;

    if (vizSmooth.length !== count) {
      vizSmooth = Array(count).fill(0);
    }
    let peaks = vizPeaks;
    if (peaks.length !== count) {
      peaks = vizPeaks = Array(count).fill(0);
    }

    for (let i = 0; i < count; i++) {
      const fi = (i / count) * (data.length - 1);
      const idx0 = Math.floor(fi);
      const idx1 = Math.min(idx0 + 1, data.length - 1);
      const frac = fi - idx0;
      const v0 = data[idx0] / 255;
      const v1 = data[idx1] / 255;
      const t = frac * frac * (3 - 2 * frac);
      const target = v0 + (v1 - v0) * t;

      if (target > vizSmooth[i]) {
        vizSmooth[i] += (target - vizSmooth[i]) * 0.45;
      } else {
        vizSmooth[i] += (target - vizSmooth[i]) * 0.06;
      }

      if (vizSmooth[i] > peaks[i]) {
        peaks[i] = vizSmooth[i];
      } else {
        peaks[i] -= 0.008;
        if (peaks[i] < 0) peaks[i] = 0;
      }
    }

    ctx.clearRect(0, 0, w, h);

    ctx.globalAlpha = 0.15;
    for (let i = 0; i < count; i++) {
      if (vizSmooth[i] < 0.01) continue;
      const barH = vizSmooth[i] * cx * 0.95;
      const { x, bw } = barGeom[i];
      ctx.fillStyle = accent;
      ctx.fillRect(x - 1, cx - barH - 1, bw + 2, barH * 2 + 2);
    }

    ctx.globalAlpha = 1;
    for (let i = 0; i < count; i++) {
      if (vizSmooth[i] < 0.01) continue;
      const barH = vizSmooth[i] * cx * 0.95;
      const { x, bw } = barGeom[i];
      ctx.fillStyle = accent;
      ctx.fillRect(x, cx - barH, bw, barH * 2);
    }

    ctx.globalAlpha = 0.5;
    for (let i = 0; i < count; i++) {
      if (vizSmooth[i] < 0.01) continue;
      const barH = vizSmooth[i] * cx * 0.95;
      const { x, bw } = barGeom[i];
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(x, cx - barH * 0.15, bw, barH * 0.3);
    }

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = accent;
    for (let i = 0; i < count; i++) {
      if (peaks[i] < 0.015) continue;
      const { x, bw } = barGeom[i];
      const py = cx - peaks[i] * cx * 0.95;
      ctx.fillRect(x + bw / 2 - 1, py - 1, 2, 2);
      ctx.fillRect(x + bw / 2 - 1, cx * 2 - py - 1, 2, 2);
    }

    ctx.globalAlpha = 1;

    if (!vizPaused) vizAnimId = requestAnimationFrame(drawViz);
  }

  function startVizLoop(): void {
    if (vizPaused || vizAnimId) return;
    vizAnimId = requestAnimationFrame(drawViz);
  }

  function stopVizLoop(): void {
    if (vizIdleTimer) {
      clearTimeout(vizIdleTimer);
      vizIdleTimer = null;
    }
    cancelAnimationFrame(vizAnimId);
    vizAnimId = 0;
  }

  function onVizVisibilityChange(): void {
    if (document.hidden) {
      vizPaused = true;
      stopVizLoop();
    } else {
      vizPaused = false;
      startVizLoop();
    }
  }

  function updateAccent(): void {
    cachedAccent =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent-base').trim() ||
      '#7c6aef';
  }

  onMounted(() => {
    startVizLoop();
    document.addEventListener('visibilitychange', onVizVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVizVisibilityChange);
    stopVizLoop();
  });

  return {
    vizCanvas,
    updateAccent,
    setCanvas: (el: unknown) => (vizCanvas.value = el as HTMLCanvasElement | null)
  };
}
