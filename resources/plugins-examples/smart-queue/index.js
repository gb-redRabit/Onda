// Kolejka z wyboru — po track:end dokładamy jeden utwór.
//
// Kandydaci pochodzą z library:search (indeks biblioteki, bez dostępu do
// plików). Pamięć o ostatnich ścieżkach w storage pilnuje, żeby ten sam utwór
// nie wracał co drugi. Tryb `shuffle` losuje z całej biblioteki, `artist`
// najpierw szuka tego samego wykonawcy.

var KEY = 'history';
var lastEnded = '';

function historySize() {
  return api.settings
    .get('historySize')
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? Math.max(10, Math.min(200, value)) : 40;
    })
    .catch(function () {
      return 40;
    });
}

function mode() {
  return api.settings
    .get('mode')
    .then(function (value) {
      return typeof value === 'string' && value ? value.toLowerCase() : 'artist';
    })
    .catch(function () {
      return 'artist';
    });
}

function loadHistory(limit) {
  return api.storage
    .get(KEY)
    .then(function (value) {
      var list = Array.isArray(value) ? value : [];
      return list.slice(-limit);
    })
    .catch(function () {
      return [];
    });
}

function pushHistory(path, limit) {
  return loadHistory(limit).then(function (list) {
    var next = list.filter(function (item) {
      return item !== path;
    });
    next.push(path);
    return api.storage.set(KEY, next.slice(-limit));
  });
}

function search(query, limit) {
  return api
    .query('library:search', { query: query, limit: limit })
    .then(function (result) {
      return (result && result.tracks) || [];
    })
    .catch(function () {
      return [];
    });
}

function clean(entries) {
  return entries.filter(function (entry) {
    return entry && typeof entry.path === 'string' && entry.path.length > 0;
  });
}

function pickSameArtist(artist, seen) {
  if (!artist) return Promise.resolve(null);
  return search(artist, 25).then(function (entries) {
    var fresh = clean(entries).filter(function (entry) {
      return seen.indexOf(entry.path) === -1;
    });
    if (!fresh.length) return null;
    return fresh[Math.floor(Math.random() * fresh.length)];
  });
}

function pickRandom(seen) {
  return search('', 60).then(function (entries) {
    var fresh = clean(entries).filter(function (entry) {
      return seen.indexOf(entry.path) === -1;
    });
    if (!fresh.length) return null;
    return fresh[Math.floor(Math.random() * fresh.length)];
  });
}

function enqueue(entry) {
  if (!entry) return Promise.resolve(false);
  return api
    .action('player:enqueue', { tracks: [entry.path] })
    .then(function (count) {
      return count > 0;
    })
    .catch(function (err) {
      api.log.warn('smart-queue: enqueue: ' + err.message);
      return false;
    });
}

function onTrackEnded(payload) {
  if (!payload || !payload.path) return;
  // track:end potrafi przyjść wielokrotnie dla tej samej ścieżki.
  if (payload.path === lastEnded) return;
  lastEnded = payload.path;

  Promise.all([historySize(), mode(), loadHistory(50)]).then(function (res) {
    var size = res[0];
    var currentMode = res[1];
    var seen = res[2];
    if (seen.indexOf(payload.path) === -1) seen = seen.concat([payload.path]);
    var pick = currentMode === 'shuffle' ? pickRandom(seen) : pickSameArtist(payload.artist, seen);
    return pick
      .then(function (entry) {
        return entry || pickRandom(seen);
      })
      .then(enqueue)
      .then(function (added) {
        if (added) api.log.info('smart-queue: dokładam ' + (entry && entry.title));
        pushHistory(payload.path, size).catch(function () {});
      });
  });
}

api.on('app:start', function () {
  api.query('library:count').then(function (count) {
    api.log.info('smart-queue: biblioteka ma ' + (count ? count.tracks : 0) + ' utworów');
  });
});

api.on('track:play', function (payload) {
  // Nowy utwór ręcznie = użytkownik przejął kontrolę nad kolejnością.
  if (payload && payload.path === lastEnded) lastEnded = '';
});

api.on('track:end', onTrackEnded);

api.registerCommand({
  id: 'smart-queue:reset',
  label: 'Kolejka: wyczyść historię wyboru',
  action: function () {
    api.storage
      .remove(KEY)
      .then(function () {
        api.notify({ type: 'info', title: 'Kolejka', message: 'Historia wyboru wyczyszczona.' });
      })
      .catch(function () {});
  }
});

api.log.info('Kolejka z wyboru: gotowa (tryb artist / shuffle)');
