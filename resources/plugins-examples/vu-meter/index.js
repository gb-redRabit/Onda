// Żywy wskaźnik poziomu (VU) w slocie UI.
//
// Źródłem danych jest player:spectrum — znormalizowane koszyki 0..1, a nie
// surowy bufor PCM, więc wtyczka nie dostaje dostępu do strumienia audio.
// Atak jest szybki, wypuszczanie wolne (jak w klasycznym VU), a szczyt
// trzymany jest przez sekundę i opada.

var SLOT = 'audio-view';
var TICK_MS = 100;
var PEAK_HOLD_MS = 1000;
var level = 0;
var peak = 0;
var peakAt = 0;
var running = false;
var trackId = null;

function width() {
  return api.settings
    .get('width')
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? Math.max(8, Math.min(28, value)) : 18;
    })
    .catch(function () {
      return 18;
    });
}

function bar(value, size) {
  var filled = Math.round(value * size);
  var out = '';
  for (var i = 0; i < size; i++) out += i < filled ? '█' : '·';
  return out;
}

function average(bins) {
  if (!bins || !bins.length) return 0;
  var sum = 0;
  for (var i = 0; i < bins.length; i++) sum += bins[i];
  // Średnia z log-koszyków jest niska; delikatne podniesienie wypięcia.
  return Math.min(1, (sum / bins.length) * 1.8);
}

function paint(size) {
  var now = Date.now();
  if (now - peakAt > PEAK_HOLD_MS) peak = Math.max(level, peak - 0.02);
  api.ui
    .set(SLOT, [
      { label: 'Poziom', value: bar(level, size) },
      { label: 'Szczyt', value: bar(peak, size) }
    ])
    .catch(function (err) {
      api.log.warn('vu-meter: ' + err.message);
      stop();
    });
}

function tick(size) {
  api
    .query('player:spectrum', { bins: 24 })
    .then(function (result) {
      if (!result || !result.available) {
        level = level * 0.8;
      } else {
        var next = average(result.bins);
        // Szybki atak, wolne opadanie.
        level = next > level ? next : level * 0.82 + next * 0.18;
        if (level > peak) {
          peak = level;
          peakAt = Date.now();
        }
      }
      paint(size);
    })
    .catch(function (err) {
      api.log.warn('vu-meter: ' + err.message);
      stop();
    });
}

var sizeCache = 18;

function loop() {
  if (!running) return;
  tick(sizeCache);
  setTimeout(loop, TICK_MS);
}

function start() {
  if (running) return;
  running = true;
  width().then(function (size) {
    sizeCache = size;
    loop();
  });
}

function stop() {
  if (!running) return;
  running = false;
  api.ui.clear(SLOT).catch(function () {});
  level = 0;
  peak = 0;
}

api.on('app:start', function () {
  api.query('player:status').then(function (status) {
    trackId = status && status.currentTrack ? status.currentTrack.id : null;
    if (trackId) start();
  });
});

api.on('track:play', function (payload) {
  var id = payload && payload.id ? payload.id : null;
  if (!id) return;
  trackId = id;
  level = 0;
  peak = 0;
  start();
});

api.log.info('Wskaźnik poziomu: slot audio-view zasilany przez player:spectrum');
