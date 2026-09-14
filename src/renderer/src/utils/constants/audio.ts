export const EQUALIZER_PRESETS: Record<string, Record<number, number>> = {
  flat: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  pop: { 0: -1, 1: 2, 2: 4, 3: 4, 4: 2, 5: -1, 6: -1, 7: -1, 8: 2, 9: 2 },
  rock: { 0: 5, 1: 3, 2: -2, 3: -4, 4: -2, 5: 2, 6: 5, 7: 6, 8: 6, 9: 5 },
  jazz: { 0: 3, 1: 2, 2: 0, 3: 2, 4: -2, 5: -2, 6: 0, 7: 2, 8: 3, 9: 4 },
  classical: { 0: 4, 1: 3, 2: 2, 3: 1, 4: -1, 5: -1, 6: 0, 7: 2, 8: 3, 9: 4 },
  bassBoost: { 0: 8, 1: 6, 2: 4, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  trebleBoost: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 4, 7: 6, 8: 8, 9: 8 },
  vocal: { 0: -2, 1: -3, 2: -3, 3: 1, 4: 4, 5: 4, 6: 3, 7: 1, 8: 0, 9: -2 }
};

export const EQUALIZER_PRESET_LABELS: Record<string, string> = {
  flat: 'Flat',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Classical',
  bassBoost: 'Bass',
  trebleBoost: 'Treble',
  vocal: 'Vocal'
};
