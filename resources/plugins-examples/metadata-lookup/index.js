// Wydanie z MusicBrainz — odczytowe, z cache i bez ruchu w sieci bez potrzeby.
//
// Zapytanie leci przez proxy aplikacji (api.fetch) i tylko na hosta
// dopisanego w network.allow. Wtyczka niczego nie zapisuje na dysku:
// pokazuje rok wydania i liczbę ścieżek w slocie UI, a wynik trzyma w storage,
// żeby nie odpytywać serwisu przy każdym odsłuchu.

var SLOT = 'audio-view';
var KEY = 'cache';
var ENDPOINT = 'https://musicbrainz.org/ws/2/recording';
var lastTrack = '';

function cacheDays() {
  return api.settings
    .get('cacheDays')
    .then(function (value) {
      return typeof value === 'number' && isFinite(value) ? Math.max(1, Math.min(90, value)) : 30;
    })
    .catch(function () {
      return 30;
    });
}

function keyFor(track) {
  return ((track.artist || '?') + '|' + (track.title || '?')).toLowerCase();
}

function loadCache() {
  return api.storage
    .get(KEY)
    .then(function (value) {
      return value && typeof value === 'object' ? value : {};
    })
    .catch(function () {
      return {};
    });
}

function putCache(key, record) {
  return loadCache().then(function (cache) {
    cache[key] = record;
    // Cache rośnie w liczbie utworów, nie w czasie — trzymamy tylko ostatnie.
    var keys = Object.keys(cache);
    if (keys.length > 300) {
      keys
        .sort(function (a, b) {
          return cache[a].at - cache[b].at;
        })
        .slice(0, keys.length - 300)
        .forEach(function (old) {
          delete cache[old];
        });
    }
    return api.storage.set(KEY, cache);
  });
}

function quote(value) {
  return '"' + String(value).replace(/"/g, '') + '"';
}

function buildUrl(track) {
  var query = track.artist ? 'artist:' + quote(track.artist) : '';
  if (track.title) query += (query ? ' AND ' : '') + 'recording:' + quote(track.title);
  if (!query) return null;
  return ENDPOINT + '?query=' + encodeURIComponent(query) + '&fmt=json&limit=1';
}

function firstRelease(recording) {
  if (!recording || !Array.isArray(recording.releases) || !recording.releases.length) return null;
  var group = recording.releases[0]['release-group'];
  return {
    year: (group && group['first-release-date']) || null,
    album: recording.releases[0].title || null
  };
}

function request(track) {
  var url = buildUrl(track);
  if (!url) return Promise.resolve(null);
  return api
    .fetch(url, {
      method: 'GET',
      responseType: 'json',
      timeoutMs: 8000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Onda plugin example (metadata-lookup)'
      }
    })
    .then(function (result) {
      if (!result || !result.ok || !result.data || !Array.isArray(result.data.recordings))
        return null;
      var recording = result.data.recordings[0];
      var release = firstRelease(recording);
      var artist = '';
      if (Array.isArray(recording['artist-credit']) && recording['artist-credit'].length) {
        artist = recording['artist-credit'][0].name || '';
      }
      return {
        title: recording.title || null,
        artist: artist,
        year: release && release.year ? String(release.year).slice(0, 4) : null,
        album: release && release.album ? release.album : null,
        length: typeof recording.length === 'number' ? recording.length : null
      };
    })
    .catch(function (err) {
      api.log.warn('metadata-lookup: ' + err.message);
      return null;
    });
}

function show(record) {
  if (!record) {
    return api.ui.clear(SLOT).catch(function () {});
  }
  var lines = [];
  if (record.year) lines.push(record.year);
  if (record.album) lines.push(record.album);
  if (record.length) lines.push(Math.round(record.length / 1000) + ' s');
  if (!lines.length) {
    return api.ui.clear(SLOT).catch(function () {});
  }
  return api.ui.set(SLOT, [{ label: 'Wydanie', value: lines.join(' · ') }]).catch(function () {});
}

function lookup(track, force) {
  if (!track || !track.title) return;
  if (!force && keyFor(track) === lastTrack) return;
  lastTrack = keyFor(track);

  Promise.all([loadCache(), cacheDays()]).then(function (res) {
    var cache = res[0];
    var days = res[1];
    var key = keyFor(track);
    var hit = cache[key];
    if (hit && Date.now() - hit.at < days * 24 * 3600 * 1000) {
      show(hit.record);
      return;
    }
    request(track).then(function (record) {
      if (!record) {
        show(null);
        return;
      }
      putCache(key, { at: Date.now(), record: record }).catch(function () {});
      show(record);
    });
  });
}

api.on('app:start', function () {
  api.query('player:status').then(function (status) {
    if (status && status.currentTrack) lookup(status.currentTrack, false);
  });
});

api.on('track:play', function (payload) {
  lastTrack = '';
  lookup(payload, false);
});

api.registerCommand({
  id: 'metadata-lookup:refresh',
  label: 'MusicBrainz: sprawdź bieżący utwór ponownie',
  action: function () {
    api.query('player:status').then(function (status) {
      if (!status || !status.currentTrack) {
        api.notify({ type: 'info', title: 'MusicBrainz', message: 'Nic nie gra.' });
        return;
      }
      lookup(status.currentTrack, true);
      api.notify({
        type: 'info',
        title: 'MusicBrainz',
        message: 'Sprawdzam: ' + status.currentTrack.title
      });
    });
  }
});

api.log.info('MusicBrainz: sprawdzam wydanie pierwszego utworu');
