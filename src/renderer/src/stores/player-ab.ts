import { ref } from 'vue';

// Pętla A–B (powtarzanie fragmentu — nauka instrumentu). Stan trzymany razem z
// odtwarzaczem, więc działa wspólnie dla WIDEO i AUDIO. Czysta logika — bez odwołań
// do elementów mediów; egzekwowanie pętli robią widoki (wideo `timeupdate`, audio `watch`).

export function usePlayerAb() {
  const abA = ref<number | null>(null);
  const abB = ref<number | null>(null);
  const abActive = ref(false);

  function setA(time: number): void {
    const a = Math.max(0, time);
    abA.value = a;
    // B przed (lub równy) A jest bez sensu — czyścimy je i wyłączamy pętlę.
    if (abB.value !== null && abB.value <= a) {
      abB.value = null;
      abActive.value = false;
    }
  }

  function setB(time: number): void {
    if (abA.value === null) return; // B bez A nie ma sensu
    const b = Math.max(0, time);
    if (b <= abA.value) return; // B musi być za A
    abB.value = b;
    abActive.value = true;
  }

  function toggle(): void {
    if (abA.value === null || abB.value === null) return;
    abActive.value = !abActive.value;
  }

  function clear(): void {
    abA.value = null;
    abB.value = null;
    abActive.value = false;
  }

  // Przeciąganie znaczników: nie pozwalamy przeskoczyć drugiego punktu.
  function moveA(time: number): void {
    const a = Math.max(0, time);
    if (abB.value !== null && a >= abB.value) return;
    abA.value = a;
  }
  function moveB(time: number): void {
    const b = Math.max(0, time);
    if (abA.value !== null && b <= abA.value) return;
    abB.value = b;
  }

  /** Docelowy czas pętli, gdy aktywna i minęliśmy B; inaczej `null`. */
  function loopTarget(currentTime: number): number | null {
    if (!abActive.value || abA.value === null || abB.value === null) return null;
    return currentTime >= abB.value ? abA.value : null;
  }

  return { abA, abB, abActive, setA, setB, toggle, clear, moveA, moveB, loopTarget };
}
