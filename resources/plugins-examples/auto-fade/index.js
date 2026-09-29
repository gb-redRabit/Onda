// Płynne wyciszanie końcówki utworu.
//
// Hook track:timeupdate przychodzi raz na sekundę (limit hosta), więc
// wyciszanie ma ~1 s zgrubności — wystarczająco, by zniknął nagły skok
// głośności na ostatnich sekundach. Głośność wraca w hooku track:play,
// czyli zanim zacznie grać następny utwór.

var fadeFrom = null;
var lastPosition = -1;

function seconds() {
  return api.settings
    .get('fadeSeconds')
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? value : 8;
    })
    .catch(function () {
      return 8;
    });
}

function volumeNow() {
  return api
    .query('player:status')
    .then(function (status) {
      return typeof status.volume === 'number' ? status.volume : null;
    })
    .catch(function () {
      return null;
    });
}

function restore() {
  if (fadeFrom === null) return Promise.resolve();
  var target = fadeFrom;
  fadeFrom = null;
  return api.action('player:setVolume', { volume: target }).catch(function () {});
}

api.on('track:play', function () {
  lastPosition = -1;
  restore();
});

api.on('track:end', function () {
  lastPosition = -1;
  restore();
});

api.on('track:timeupdate', function (payload) {
  if (!payload || typeof payload.position !== 'number') return;
  var position = payload.position;
  // Seek w tył → zacznij wyciszanie od nowa.
  if (position < lastPosition) fadeFrom = null;
  lastPosition = position;

  seconds().then(function (fade) {
    if (fade <= 0) return;
    var duration = typeof payload.duration === 'number' ? payload.duration : 0;
    if (duration <= 0) return;
    var left = duration - position;
    if (left > fade) return;
    if (fadeFrom === null) {
      volumeNow().then(function (vol) {
        fadeFrom = vol === null ? 0.5 : vol;
        apply(left, fade, fadeFrom);
      });
      return;
    }
    apply(left, fade, fadeFrom);
  });
});

function apply(left, fade, from) {
  var factor = Math.max(0, Math.min(1, left / fade));
  api.action('player:setVolume', { volume: from * factor }).catch(function () {});
}

api.log.info('Wyciszanie: końcówka każdego utworu jest ściszana');
