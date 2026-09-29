// Odczyt dominującej nuty z widma.
//
// Uczciwe ograniczenie: host udostępnia 64 koszyki log-rozkładu zamiast surowego
// FFT, więc częstotliwość odtwarzacza jest zgadywana (44,1 kHz), a wynik to
// przybliżenie „o czymś gra”. Dlatego jest ustawienie kalibracji w półtonach —
// popraw je słuchem, a wskaźnik zacznie trafiać w nazwy dźwięków.

var SLOT = 'audio-view';
var BINS = 64;
var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var TICK_MS = 500;
var running = false;
var offset = 0;
var minLevel = 0.12;

function setting(key, fallback) {
  return api.settings
    .get(key)
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? value : fallback;
    })
    .catch(function () {
      return fallback;
    });
}

function loadSettings() {
  return Promise.all([setting('offset', 0), setting('minLevel', 12)]).then(function (res) {
    offset = res[0];
    // Skala 1–60 (0–1) z ustawień jako wygodne „0,12 zamiast 0,12".
    minLevel = Math.max(0.01, Math.min(0.6, res[1] / 100));
  });
}

function peak(bins) {
  var best = -1;
  var bestValue = 0;
  for (var i = 0; i < bins.length; i++) {
    if (bins[i] > bestValue) {
      bestValue = bins[i];
      best = i;
    }
  }
  return { index: best, value: bestValue };
}

function noteFromFreq(freq) {
  if (!(freq > 0)) return null;
  var midi = 69 + 12 * (Math.log(freq / 440) / Math.LN2) + offset;
  var rounded = Math.round(midi);
  var name = NAMES[((rounded % 12) + 12) % 12];
  var octave = Math.floor(rounded / 12) - 1;
  return {
    name: name + octave,
    cents: Math.round((midi - rounded) * 100),
    freq: Math.round(freq)
  };
}

function render(bins) {
  var p = peak(bins);
  if (p.index < 0 || p.value < minLevel) {
    return api.ui.clear(SLOT).catch(function () {});
  }
  // Koszyki są log-rozłożone: dolny skraj to ~40 Hz, górny ~16 kHz.
  var ratio = Math.pow(400, (p.index + 0.5) / bins.length);
  var freq = 40 * ratio;
  var note = noteFromFreq(freq);
  if (!note) return api.ui.clear(SLOT).catch(function () {});
  return api.ui
    .set(SLOT, [
      {
        label: 'Nuta',
        value: note.name + (note.cents ? ' ' + (note.cents > 0 ? '+' : '') + note.cents + '¢' : '')
      },
      { label: 'Częstotliwość', value: note.freq + ' Hz' }
    ])
    .catch(function () {});
}

function tick() {
  if (!running) return;
  api
    .query('player:spectrum', { bins: BINS })
    .then(function (result) {
      if (!result || !result.available || !result.bins) {
        return api.ui.clear(SLOT).catch(function () {});
      }
      return render(result.bins);
    })
    .catch(function (err) {
      api.log.warn('note-readout: ' + err.message);
      stop();
    })
    .then(function () {
      if (running) setTimeout(tick, TICK_MS);
    });
}

function start() {
  if (running) return;
  running = true;
  loadSettings().then(function () {
    tick();
  });
}

function stop() {
  if (!running) return;
  running = false;
  api.ui.clear(SLOT).catch(function () {});
}

api.on('app:start', start);
api.on('track:play', start);

api.registerCommand({
  id: 'note-readout:recalibrate',
  label: 'Nuta: przelicz z ustawień',
  action: function () {
    loadSettings().then(function () {
      api.notify({
        type: 'info',
        title: 'Odczyt nuty',
        message: 'Kalibracja: ' + offset + ' półtonu, próg ' + Math.round(minLevel * 100) + '.'
      });
    });
  }
});

api.log.info('Odczyt nuty: szacunek z player:spectrum, wynik wymaga kalibracji');
