// Własne pozycje w menu kontekstowym utworu + kolejka „jeszcze później”.
//
// Komendy w `track-menu` dostają snapshot utworu jako payload (path, title,
// artist, album, duration), więc nie trzeba niczego szukać w bibliotece.
// Lista „później” żyje w storage i jest zwracana do kolejki jednym poleceniem.

var KEY = 'later';
var MAX_LATER = 100;

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

function store(list) {
  return api.storage.set(KEY, list.slice(-MAX_LATER)).catch(function () {});
}

function label(track) {
  return track.title + (track.artist ? ' — ' + track.artist : '');
}

function requireTrack(payload) {
  if (!payload || typeof payload.path !== 'string' || !payload.path) {
    api.notify({ type: 'warning', title: 'Akcje utworu', message: 'Brak utworu w kontekście.' });
    return null;
  }
  return payload;
}

function notify(type, message) {
  api.notify({ type: type, title: 'Akcje utworu', message: message });
}

function enqueue(track) {
  return api.action('player:enqueue', { tracks: [track.path] }).catch(function (err) {
    notify('error', 'Nie udało się dodać: ' + err.message);
  });
}

function pushLater(track) {
  load().then(function (list) {
    if (
      list.some(function (item) {
        return item.path === track.path;
      })
    ) {
      notify('info', 'Ten utwór już czeka.');
      return;
    }
    list.push({ path: track.path, title: track.title, artist: track.artist });
    store(list).then(function () {
      notify('success', 'Dodano na później: ' + label(track));
    });
  });
}

api.registerCommand({
  id: 'track-actions:enqueue',
  label: 'Dodaj na koniec kolejki',
  location: 'track-menu',
  action: function (track) {
    var t = requireTrack(track);
    if (!t) return;
    enqueue(t).then(function () {
      notify('success', 'W kolejce: ' + label(t));
    });
  }
});

api.registerCommand({
  id: 'track-actions:later',
  label: 'Zagraj później',
  location: 'track-menu',
  action: function (track) {
    var t = requireTrack(track);
    if (t) pushLater(t);
  }
});

api.registerCommand({
  id: 'track-actions:favorite',
  label: 'Przełącz w ulubionych',
  location: 'track-menu',
  action: function (track) {
    var t = requireTrack(track);
    if (!t) return;
    api.action('track:toggleFavorite', { path: t.path }).then(
      function () {
        notify('info', 'Ulubione przełączone: ' + label(t));
      },
      function (err) {
        notify('error', 'Nie udało się przełączyć: ' + err.message);
      }
    );
  }
});

api.registerCommand({
  id: 'track-actions:info',
  label: 'Informacje o utworze',
  location: 'track-menu',
  action: function (track) {
    var t = requireTrack(track);
    if (!t) return;
    var minutes = typeof t.duration === 'number' ? Math.round(t.duration / 60) : null;
    notify(
      'info',
      [
        'Tytuł: ' + (t.title || '—'),
        'Wykonawca: ' + (t.artist || '—'),
        'Album: ' + (t.album || '—'),
        'Czas: ' + (minutes !== null ? minutes + ' min' : '—'),
        'Plik: ' + t.path
      ].join('\n')
    );
  }
});

api.registerCommand({
  id: 'track-actions:later-show',
  label: 'Później: pokaż listę',
  action: function () {
    load().then(function (list) {
      if (!list.length) {
        notify('info', 'Lista „później” jest pusta.');
        return;
      }
      var lines = list.slice(-10).map(function (item, index) {
        return index + 1 + '. ' + (item.title || '?') + (item.artist ? ' — ' + item.artist : '');
      });
      notify('info', 'Później (' + list.length + '):\n' + lines.join('\n'));
    });
  }
});

api.registerCommand({
  id: 'track-actions:later-flush',
  label: 'Później: dodaj wszystko do kolejki',
  action: function () {
    load().then(function (list) {
      if (!list.length) {
        notify('info', 'Lista „później” jest pusta.');
        return;
      }
      var paths = list.map(function (item) {
        return item.path;
      });
      api.action('player:enqueue', { tracks: paths }).then(function (count) {
        notify(
          count > 0 ? 'success' : 'warning',
          'Dodano do kolejki: ' + count + ' z ' + paths.length
        );
        if (count > 0) store([]);
      });
    });
  }
});

api.registerCommand({
  id: 'track-actions:later-clear',
  label: 'Później: wyczyść',
  action: function () {
    load().then(function () {
      api.storage.remove(KEY).then(function () {
        notify('info', 'Lista „później” wyczyszczona.');
      });
    });
  }
});

api.log.info('Akcje utworu: menu kontekstowe + kolejka „później”');
