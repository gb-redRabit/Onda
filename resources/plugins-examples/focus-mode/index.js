// Tryb skupienia — licznik sesji widoczny w slocie UI.
//
// Stan trzymany w storage (znacznik końca), więc restart aplikacji nie gubi
// sesji. Slot pokazuje tylko tekst, host rysuje własny layout.

var SLOT = 'audio-view';
var KEY = 'session';
var timer = null;

function minutes() {
  return api.settings
    .get('minutes')
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? Math.max(1, Math.min(240, value)) : 25;
    })
    .catch(function () {
      return 25;
    });
}

function flag(name, fallback) {
  return api.settings
    .get(name)
    .then(function (value) {
      return typeof value === 'boolean' ? value : fallback;
    })
    .catch(function () {
      return fallback;
    });
}

function clock(ms) {
  var total = Math.max(0, Math.ceil(ms / 1000));
  var m = Math.floor(total / 60);
  var s = total % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function stopLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function paint(left, label) {
  api.ui.set(SLOT, [{ label: label, value: clock(left) }]).catch(function (err) {
    api.log.warn('focus-mode: ' + err.message);
    stopLoop();
  });
}

function finish() {
  stopLoop();
  api.storage.set(KEY, { endsAt: 0 }).catch(function () {});
  return flag('autoPause', true)
    .then(function (shouldPause) {
      return shouldPause ? api.action('player:pause').catch(function () {}) : null;
    })
    .then(function () {
      return api.ui.clear(SLOT);
    })
    .then(function () {
      api.notify({
        type: 'success',
        title: 'Tryb skupienia',
        message: 'Sesja zakończona — odpocznij.'
      });
    });
}

function loop(endsAt) {
  stopLoop();
  timer = setInterval(function () {
    var left = endsAt - Date.now();
    if (left <= 0) {
      finish();
      return;
    }
    paint(left, 'Skupienie');
  }, 1000);
}

function start(customMinutes) {
  return minutes().then(function (value) {
    var chosen = typeof customMinutes === 'number' ? customMinutes : value;
    var endsAt = Date.now() + chosen * 60 * 1000;
    return api.storage
      .set(KEY, { endsAt: endsAt, startedAt: Date.now() })
      .then(function () {
        paint(endsAt - Date.now(), 'Skupienie');
        loop(endsAt);
        api.notify({
          type: 'info',
          title: 'Tryb skupienia',
          message: 'Sesja na ' + chosen + ' min.'
        });
      })
      .catch(function (err) {
        api.log.error('focus-mode: start: ' + err.message);
      });
  });
}

function stop(reason) {
  return api.storage
    .set(KEY, { endsAt: 0 })
    .catch(function () {})
    .then(function () {
      stopLoop();
      return api.ui.clear(SLOT);
    })
    .then(function () {
      api.notify({ type: 'info', title: 'Tryb skupienia', message: reason });
    });
}

function status() {
  return api.storage.get(KEY).then(function (state) {
    var endsAt = (state && state.endsAt) || 0;
    if (endsAt <= Date.now()) {
      api.notify({ type: 'info', title: 'Tryb skupienia', message: 'Brak aktywnej sesji.' });
      return;
    }
    api.notify({
      type: 'info',
      title: 'Tryb skupienia',
      message: 'Zostało ' + clock(endsAt - Date.now()) + '.'
    });
  });
}

api.registerCommand({
  id: 'focus-mode:start',
  label: 'Skupienie: rozpocznij sesję',
  action: function () {
    start();
  }
});

api.registerCommand({
  id: 'focus-mode:status',
  label: 'Skupienie: ile zostało',
  action: status
});

api.registerCommand({
  id: 'focus-mode:stop',
  label: 'Skupienie: zakończ sesję',
  action: function () {
    stop('Sesja zakończona wcześniej.');
  }
});

api.on('app:start', function () {
  api.storage
    .get(KEY)
    .then(function (state) {
      var endsAt = (state && state.endsAt) || 0;
      if (endsAt > Date.now()) {
        loop(endsAt);
        return;
      }
      if (endsAt) api.storage.set(KEY, { endsAt: 0 });
    })
    .catch(function () {});
});

api.log.info('Tryb skupienia: licznik w slocie audio-view');
