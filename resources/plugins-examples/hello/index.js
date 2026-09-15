// Onda plugin: hello (demo API v1)
// Biegamy w sandboksowanym workerze — jedyny kontakt z aplikacją to obiekt `api`.

api.log.info('Hello Plugin załadowany');

// Hook: aplikacja wystartowała
api.on('app:start', function (payload) {
  api.log.info(
    'Hook app:start' + (payload && payload.version ? ' (v' + payload.version + ')' : '')
  );
});

// Hook: zmiana utworu
api.on('track:play', function (payload) {
  const title = payload && payload.title ? payload.title : '(nieznany)';
  const artist = payload && payload.artist ? payload.artist : '';
  api.log.info('Odtwarzanie: ' + [artist, title].filter(Boolean).join(' — '));
});

function notify(type, title, message) {
  return api.notify({
    type: type || 'info',
    title: title || 'Hello Plugin',
    message: message || ''
  });
}

// Komenda: powitanie
api.registerCommand({
  id: 'hello:greet',
  label: 'Hello — powiedz cześć',
  icon: 'Puzzle',
  action: function () {
    notify('success', 'Cześć!', 'To działa — wtyczka Hello Plugin wywołana z palety poleceń.');
  }
});

// Komenda: status odtwarzacza
api.registerCommand({
  id: 'hello:player-status',
  label: 'Hello — pokaż status odtwarzacza',
  icon: 'Puzzle',
  action: function () {
    api
      .query('player:status', {})
      .then(function (status) {
        const track = status && status.currentTrack;
        const line =
          (status && status.isPlaying ? 'gra: ' : 'stoi: ') +
          (track ? track.artist + ' — ' + track.title : 'nic') +
          (status ? ' · kolejka: ' + status.queueLength : '');
        notify('info', 'Status odtwarzacza', line);
      })
      .catch(function (err) {
        api.log.error('player:status nie działa: ' + String(err && err.message));
      });
  }
});

// Komenda: licznik w storage (zapisywany między sesjami)
api.registerCommand({
  id: 'hello:storage-count',
  label: 'Hello — licznik uruchomień komendy',
  icon: 'Puzzle',
  action: function () {
    api.storage
      .get('count')
      .then(function (value) {
        const next = (typeof value === 'number' ? value : 0) + 1;
        return api.storage.set('count', next).then(function () {
          notify('info', 'Licznik', 'Komenda wywołana ' + next + ' ×');
        });
      })
      .catch(function (err) {
        api.log.error('storage nie działa: ' + String(err && err.message));
      });
  }
});

// Komenda: reset licznika
api.registerCommand({
  id: 'hello:storage-reset',
  label: 'Hello — wyzeruj licznik',
  icon: 'Puzzle',
  action: function () {
    api.storage.remove('count').then(function () {
      notify('info', 'Licznik', 'Wyzerowano.');
    });
  }
});

// Komenda: test sieci (wymaga internetu; domena musi być w permissions.network.allow)
api.registerCommand({
  id: 'hello:fetch-test',
  label: 'Hello — test sieci (httpbin)',
  icon: 'Puzzle',
  action: function () {
    api
      .fetch('https://httpbin.org/get', { responseType: 'json' })
      .then(function (res) {
        notify('success', 'Sieć OK', 'HTTP ' + res.status + ' · url: ' + res.data.url);
      })
      .catch(function (err) {
        api.log.error('fetch nie działa: ' + String(err && err.message));
      });
  }
});
