// Onda plugin: triangle (widok audio — przycisk w pasku narzędzi + kształt okładki)
// registerCommand z polami icon i location: 'audio-view' tworzy przycisk w pasku widoku audio.

api.log.info('Trójkątna okładka załadowany');

var SHAPES = [
  { key: 'triangle', label: 'Trójkąt' },
  { key: 'circle', label: 'Koło' },
  { key: 'diamond', label: 'Romb' },
  { key: 'hexagon', label: 'Sześciokąt' },
  { key: 'none', label: 'Bez kształtu' }
];

function notify(message) {
  return api.notify({ type: 'info', title: 'Okładka', message: message });
}

// Hook: aplikacja wystartowała → ustaw kształt z konfiguracji wtyczki (api.settings)
api.on('app:start', function () {
  api.settings
    .get('shape')
    .then(function (shape) {
      var value = typeof shape === 'string' && shape.length ? shape : 'triangle';
      return api.visual('element.decoration', { element: 'cover', value: value }).then(function () {
        api.log.info('Okładka: ' + value);
      });
    })
    .catch(function (err) {
      api.log.error('nie ustawiono kształtu: ' + String(err && err.message));
    });
});

// Przycisk w pasku widoku audio — przełącza kształt okładki (stan w storage)
api.registerCommand({
  id: 'triangle:cycle',
  label: 'Kształt okładki (trójkąt/koło/romb/sześciokąt/brak)',
  icon: 'Triangle',
  location: 'audio-view',
  shortcut: 'Ctrl+Alt+T',
  action: function () {
    return api.storage.get('index').then(function (value) {
      var next = ((typeof value === 'number' ? value : -1) + 1) % SHAPES.length;
      return api.storage.set('index', next).then(function () {
        var shape = SHAPES[next];
        return api
          .visual('element.decoration', { element: 'cover', value: shape.key })
          .then(function () {
            return api.settings.get('notifyOnChange').then(function (notifyEnabled) {
              if (notifyEnabled !== false) notify('Okładka: ' + shape.label);
              api.log.info('Okładka zmieniona na: ' + shape.label);
            });
          });
      });
    });
  }
});

// Te same akcje dostępne też z palety poleceń (bez location)
api.registerCommand({
  id: 'triangle:shape-triangle',
  label: 'Trójkątna okładka — trójkąt',
  icon: 'Triangle',
  action: function () {
    return api
      .visual('element.decoration', { element: 'cover', value: 'triangle' })
      .then(function () {
        notify('Okładka: Trójkąt');
      });
  }
});

api.registerCommand({
  id: 'triangle:shape-none',
  label: 'Trójkątna okładka — oryginalny kształt',
  icon: 'Triangle',
  action: function () {
    return api.visual('element.decoration', { element: 'cover', value: 'none' }).then(function () {
      notify('Przywrócono oryginalny kształt.');
    });
  }
});

// Menu kontekstowe utworu — pokazuje kontekst utworu w Logach
api.registerCommand({
  id: 'triangle:track-info',
  label: 'Pokaż informacje o utworze',
  location: 'track-menu',
  icon: 'Info',
  action: function (ctx) {
    api.log.info(
      'Utwór z menu kontekstowego: ' +
        ((ctx && ctx.title) || '?') +
        ' — ' +
        ((ctx && ctx.path) || '?')
    );
  }
});
