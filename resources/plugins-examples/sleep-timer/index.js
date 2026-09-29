// Minuterka snu z płynnym wyciszaniem.
//
// Licznik żyje w storage (klucz `state` z datą końca), więc restart aplikacji
// go nie gubi. Ostatnie `fadeSeconds` sekund głośność jest obniżana
// proporcjonalnie do pozostałego czasu, a po pauzie wraca do wartości sprzed
// wyciszania. Wtyczka ustawia głośność tylko w fazie wyciszania — jeśli
// ustawisz ją ręcznie w czasie odliczania, nie będzie ruszana.

var KEY = 'state';
var timer = null;
var fadeFrom = null; // głośność sprzed wyciszania

function now() {
  return Date.now();
}

function load() {
  return api.storage.get(KEY);
}

function save(state) {
  return api.storage.set(KEY, state);
}

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

function minutesToMs(minutes) {
  return Math.max(0, Math.floor(minutes)) * 60 * 1000;
}

function formatClock(ms) {
  var total = Math.max(0, Math.ceil(ms / 1000));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var pad = function (n) {
    return (n < 10 ? '0' : '') + n;
  };
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function restoreVolume() {
  if (fadeFrom === null) return;
  var target = fadeFrom;
  fadeFrom = null;
  await api.action('player:setVolume', { volume: target }).catch(function () {});
}

async function currentVolume() {
  try {
    var status = await api.query('player:status');
    return typeof status.volume === 'number' ? status.volume : null;
  } catch (e) {
    return null;
  }
}

async function finish(reason) {
  stopTimer();
  await restoreVolume();
  await save({ endsAt: 0 }).catch(function () {});
  if (reason === 'done') {
    await api.action('player:pause').catch(function () {});
    api.notify({
      type: 'info',
      title: 'Minuterka snu',
      message: 'Odtwarzanie zatrzymane — czas minął.'
    });
  }
}

async function tick() {
  var state = (await load()) || {};
  var left = (state.endsAt || 0) - now();
  if (left <= 0) {
    await finish('done');
    return;
  }
  var fadeMs = (await setting('fadeSeconds', 20)) * 1000;
  if (fadeMs > 0 && left <= fadeMs) {
    if (fadeFrom === null) {
      var vol = await currentVolume();
      fadeFrom = vol === null ? 0.5 : vol;
    }
    var factor = Math.max(0, left / fadeMs);
    await api.action('player:setVolume', { volume: fadeFrom * factor }).catch(function () {});
  }
}

async function start(customMinutes) {
  var minutes = typeof customMinutes === 'number' ? customMinutes : await setting('minutes', 30);
  await restoreVolume();
  await save({ endsAt: now() + minutesToMs(minutes), startedAt: now() });
  stopTimer();
  timer = setInterval(function () {
    tick();
  }, 1000);
  api.notify({
    type: 'success',
    title: 'Minuterka snu',
    message: 'Zatrzymam odtwarzanie za ' + minutes + ' min.'
  });
}

async function cancel() {
  var state = (await load()) || {};
  if (!state.endsAt) {
    api.notify({ type: 'info', title: 'Minuterka snu', message: 'Nic nie jest zaplanowane.' });
    return;
  }
  await finish('cancel');
  api.notify({ type: 'info', title: 'Minuterka snu', message: 'Anulowano.' });
}

async function report() {
  var state = (await load()) || {};
  var left = (state.endsAt || 0) - now();
  if (left <= 0) {
    api.notify({ type: 'info', title: 'Minuterka snu', message: 'Minutera nie jest aktywna.' });
    return;
  }
  api.notify({
    type: 'info',
    title: 'Minuterka snu',
    message: 'Zostało ' + formatClock(left) + '.'
  });
}

function abortOnTrackChange() {
  // Nowy utwór = nowa decyzja użytkownika; wyciszanie nie ma sensu.
  if (fadeFrom !== null) restoreVolume();
}

api.registerCommand({
  id: 'sleep-timer:start',
  label: 'Minuterka snu: włącz',
  action: function () {
    start();
  }
});

api.registerCommand({
  id: 'sleep-timer:status',
  label: 'Minuterka snu: ile zostało',
  action: function () {
    report();
  }
});

api.registerCommand({
  id: 'sleep-timer:cancel',
  label: 'Minuterka snu: anuluj',
  action: function () {
    cancel();
  }
});

api.on('app:start', function () {
  load().then(function (state) {
    state = state || {};
    if (state.endsAt && state.endsAt > now()) {
      stopTimer();
      timer = setInterval(function () {
        tick();
      }, 1000);
      api.log.info('Minuterka snu: wznowiona, zostało ' + formatClock(state.endsAt - now()));
      return;
    }
    if (state.endsAt) save({ endsAt: 0 });
  });
});

api.on('track:play', abortOnTrackChange);
api.on('track:end', abortOnTrackChange);

api.log.info('Minuterka snu: komendy w palecie (włącz / ile zostało / anuluj)');
