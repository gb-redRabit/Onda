export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export function createEqFilters(audioCtx: AudioContext): BiquadFilterNode[] {
  return EQ_FREQUENCIES.map((freq, i) => {
    const filter = audioCtx.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  });
}

export function connectEqChain(
  gainA: GainNode,
  gainB: GainNode,
  filters: BiquadFilterNode[],
  gainNode: GainNode,
  analyser: AnalyserNode,
  destination: AudioDestinationNode
): void {
  const firstFilter = filters[0];
  if (firstFilter) {
    gainA.connect(firstFilter);
    gainB.connect(firstFilter);
    let chain: AudioNode = firstFilter;
    for (let i = 1; i < filters.length; i++) {
      chain.connect(filters[i]);
      chain = filters[i];
    }
    chain.connect(gainNode);
  } else {
    gainA.connect(gainNode);
    gainB.connect(gainNode);
  }
  gainNode.connect(analyser);
  analyser.connect(destination);
}
