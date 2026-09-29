// Przykład: bezpieczny slot UI hostowany przez aplikację.
//
// Wtyczka nie ma dostępu do DOM — pisze wyłącznie krótkie pary tekstu
// (label/value), a rysuje je host w widoku audio. Payload jest walidowany
// po stronie aplikacji: maks. 8 pozycji, 48 znaków etykiety, 160 wartości,
// bez HTML i bez znaków sterujących.
//
// Wymagane w manifeście: permissions.visual = true oraz uiSlots: ["audio-view"].

var SLOT = 'audio-view';
var timer = null;

function formatTime(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return '--:--';
  var total = Math.floor(seconds);
  var m = Math.floor(total / 60);
  var s = total % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function level(bins) {
  // Średnia z ostatnich binów — zgrubny wskaźnik głośności 0..1.
  if (!bins || !bins.length) return 0;
  var sum = 0;
  for (var i = 0; i < bins.length; i++) sum += bins[i];
  return Math.min(1, sum / bins.length);
}

function bar(value) {
  var filled = Math.round(value * 10);
  var out = '';
  for (var i = 0; i < 10; i++) out += i < filled ? '█' : '·';
  return out;
}

function clear() {
  api.ui.clear(SLOT);
}

async function tick() {
  try {
    var progress = await api.query('player:progress');
    var spectrum = await api.query('player:spectrum', { bins: 16 });
    var track = progress && progress.track;
    if (!track) {
      clear();
      return;
    }
    api.ui.set(SLOT, [
      {
        label: 'Czas',
        value: formatTime(progress.position) + ' / ' + formatTime(progress.duration)
      },
      { label: 'Poziom', value: bar(level(spectrum.bins)) },
      { label: 'Plik', value: track.title + (track.artist ? ' — ' + track.artist : '') }
    ]);
  } catch (e) {
    clear();
  }
}

function start() {
  if (timer) return;
  tick();
  // 1 Hz: hook track:timeupdate też przychodzi raz na sekundę, ale slot
  // odświeżamy niezależnie, żeby widmo nie stało.
  timer = setInterval(tick, 1000);
}

api.on('app:start', start);
api.on('track:play', function () {
  clear();
  tick();
});
api.on('track:timeupdate', function (payload) {
  if (payload && typeof payload.position === 'number') tick();
});

api.log.info('Pasek postępu: wpisuję dane do slotu audio-view');
