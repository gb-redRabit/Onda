// Historia odsłuchań — tylko w storage wtyczki.
//
// Czas słuchania liczymy z hooków track:timeupdate (raz na sekundę), a nie z
// deklarowanego czasu utworu: przewijanie w przód nie nalicza odsłuchu.
// Rekordy trzymamy w ograniczonym buforze, żeby storage nie rósł w nieskończoność.

var KEY = 'entries';
var MAX_ENTRIES = 200;
var session = { path: '', seconds: 0, last: 0 };

function dayKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function load() {
  return api.storage
    .get(KEY)
    .then(function (value) {
      return Array.isArray(value) ? value : [];
    })
    .catch(function () {
      return [];
    });
}

function store(entries) {
  return api.storage.set(KEY, entries.slice(-MAX_ENTRIES)).catch(function () {});
}

function add(entries, record) {
  entries.push(record);
  return store(entries);
}

function todayMinutes(entries) {
  var today = dayKey(Date.now());
  var seconds = 0;
  for (var i = 0; i < entries.length; i++) {
    if (dayKey(entries[i].at) === today) seconds += entries[i].seconds || 0;
  }
  return Math.round(seconds / 60);
}

function weekMinutes(entries) {
  var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  var seconds = 0;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].at >= weekAgo) seconds += entries[i].seconds || 0;
  }
  return Math.round(seconds / 60);
}

function topArtists(entries, limit) {
  var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  var totals = {};
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.at < weekAgo) continue;
    var artist = entry.artist || '—';
    totals[artist] = (totals[artist] || 0) + (entry.seconds || 0);
  }
  return Object.keys(totals)
    .sort(function (a, b) {
      return totals[b] - totals[a];
    })
    .slice(0, limit)
    .map(function (artist) {
      return artist + ' (' + Math.round(totals[artist] / 60) + ' min)';
    });
}

function recent(entries, limit) {
  return entries
    .slice(-limit)
    .reverse()
    .map(function (entry) {
      return '· ' + (entry.title || '?') + (entry.artist ? ' — ' + entry.artist : '');
    });
}

function report() {
  load().then(function (entries) {
    var lines = [
      'Dzisiaj: ' + todayMinutes(entries) + ' min',
      'Ostatni tydzień: ' + weekMinutes(entries) + ' min'
    ];
    var artists = topArtists(entries, 3);
    if (artists.length) lines.push('Top: ' + artists.join(', '));
    var last = recent(entries, 5);
    if (last.length) lines.push('Ostatnio:', last.join('\n'));
    api.notify({ type: 'info', title: 'Historia odsłuchań', message: lines.join('\n') });
  });
}

function onPlay(payload) {
  // Zmiana utworu zamyka poprzednią sesję, jeśli nie zdążył się domknąć.
  if (session.path && session.seconds > 5 && session.path !== (payload && payload.path)) {
    load().then(function (entries) {
      add(entries, {
        path: session.path,
        title: session.title,
        artist: session.artist,
        seconds: session.seconds,
        at: Date.now()
      });
    });
  }
  session = {
    path: (payload && payload.path) || '',
    title: payload && payload.title,
    artist: payload && payload.artist,
    seconds: 0,
    last: 0
  };
}

function onTick(payload) {
  if (!payload || !session.path) return;
  var position = typeof payload.position === 'number' ? payload.position : 0;
  if (session.last > 0) {
    var delta = position - session.last;
    // Przewinięcie w przód nie jest odsłuchem; pomijamy skoki i kroki w tył.
    if (delta > 0 && delta <= 3) session.seconds += delta;
  }
  session.last = position;
}

function onEnd(payload) {
  var path = (payload && payload.path) || session.path;
  if (!path || session.seconds < 5) {
    session = { path: '', seconds: 0, last: 0 };
    return;
  }
  load().then(function (entries) {
    add(entries, {
      path: path,
      title: session.title,
      artist: session.artist,
      seconds: session.seconds,
      at: Date.now()
    });
  });
  session = { path: '', seconds: 0, last: 0 };
}

api.registerCommand({
  id: 'listen-history:report',
  label: 'Historia: podsumowanie',
  action: report
});

api.registerCommand({
  id: 'listen-history:clear',
  label: 'Historia: wyczyść',
  action: function () {
    api.storage
      .remove(KEY)
      .then(function () {
        api.notify({ type: 'info', title: 'Historia', message: 'Historia wyczyszczona.' });
      })
      .catch(function () {});
  }
});

api.on('app:start', function () {
  load().then(function (entries) {
    api.log.info('Historia: ' + entries.length + ' zapisanych odsłuchań');
  });
});

api.on('track:play', onPlay);
api.on('track:timeupdate', onTick);
api.on('track:end', onEnd);

api.log.info('Historia odsłuchań: dane zostają w storage wtyczki');
