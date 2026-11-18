export default {
  plugins: {
    title: 'Onda Plugins',
    description:
      'Sandboxed extensions running in a dedicated worker. Data and network access are controlled by the manifest.',
    empty: 'No plugins installed.',
    installFromFolder: 'Install from folder',
    examplesTitle: 'Examples',
    examplesDesc:
      'Example plugins. Installation leaves them disabled; review their access before enabling.',
    examplesInstall: 'Install',
    examplesInstalled: 'Installed',
    examplesError: 'Could not install the example',
    installSuccess: 'Plugin installed',
    installDisabledHint: 'It remains disabled. Enable it to review the access it requests.',
    enableConfirmTitle: 'Review plugin access',
    enableConfirmWarning:
      'When enabled, this plugin’s code will run in an isolated worker with the access listed below.',
    permissionChangedWarning:
      'The plugin’s access scope or code changed since it was last enabled. Review and approve it again.',
    requestedPermissions: 'Requested permissions',
    noOptionalPermissions: 'This plugin requests no optional permissions.',
    permissionStorage: 'Read and write its private, persistent plugin storage.',
    permissionNotifications: 'Show notifications inside Onda.',
    permissionPlayer: 'Control playback, the queue, and favorites.',
    permissionVisual: 'Set decorations supported by the audio view.',
    permissionNetwork: 'Make network requests through the Onda proxy.',
    networkAllowlist: 'Allowed URL patterns:',
    requestedHooks: 'Events this plugin subscribes to',
    hooksDescription:
      'Hooks provide track or download metadata; some payloads include file paths and URLs.',
    noHooksRequested: 'This plugin does not subscribe to events.',
    requestedVisualSlots: 'Declared appearance variants',
    requestedUiSlots: 'Declared UI slots (text rendered by the app)',
    uiSlotTextOnly: 'the plugin only writes text; the app draws the layout',
    enableCancel: 'Cancel',
    enableConfirm: 'Approve and enable',
    enable: 'Review access and enable',
    disable: 'Disable plugin',
    uninstall: 'Uninstall plugin',
    enableFailed: 'Could not enable the plugin',
    installError: 'Could not install the plugin',
    permissionReviewRequired: 'Access approval required',
    refresh: 'Refresh',
    enabled: 'Enabled',
    logs: 'Logs',
    noLogs: 'No entries.',
    commands: 'Commands',
    settings: 'Configuration',
    guide: {
      title: 'Plugin guide',
      searchPlaceholder: 'Search the guide (e.g. slot, spectrum, storage)…',
      searchEmpty: 'No section matches the query.',
      copyCode: 'Copy code',
      intro:
        'Plugins let you extend Onda with small JavaScript programs. They run in a safe, sandboxed worker, so the only way they can talk to the app is through the api object. Everything below describes what a plugin can do, how to install one and how to write your own.',
      sections: [
        {
          heading: 'What is a plugin?',
          body: 'A plugin is a JavaScript extension of Onda that runs in a separate, sandboxed web worker. It has no access to the application window or the DOM: the api object is the only channel to talk to the app. Permissions (data, network, player, notifications, appearance) are declared in the manifest, and every network request is additionally filtered by the main process.'
        },
        {
          heading: 'Worker anatomy and sandbox',
          body: 'A plugin is a separate web worker, not a piece of UI. Here is the full path from installation to disabling.',
          list: [
            'Installation copies the files into the app data directory; the plugin starts disabled, with a stored SHA-256 digest of the entry file and of the declared capabilities.',
            'The user clicks the power icon, reviews the permissions and approves. Only then does the app spawn the worker and inject the shim.',
            'The shim blocks direct fetch, XMLHttpRequest, WebSocket, EventSource, importScripts, indexedDB and caches inside the worker - the network is reachable only through api.fetch.',
            'Hooks are delivered only when the name matches an entry in manifest.hooks; payloads of undeclared hooks never reach the worker.',
            'The app pings the worker every 15 s (heartbeat). No answer within 10 s raises worker-heartbeat-timeout and disables the plugin, so a frozen script cannot stay in the background.',
            'Disabling stops the worker, unregisters commands and clears the plugin UI changes (decorations, slots). Storage and configuration stay, because they belong to the plugin folder.',
            'Uninstalling removes the plugin folder together with its storage, configuration and data files.',
            'api calls are asynchronous with a 45 s limit; a payload larger than 100,000 bytes of JSON is rejected before it leaves the worker.'
          ]
        },
        {
          heading: 'Plugin structure',
          body: 'Every plugin lives in its own directory. The directory name becomes the plugin id.',
          list: [
            'manifest.json - metadata and permissions (described below)',
            'index.js - plugin code; the path is taken from the entry field',
            'Allowed id characters: lowercase letters, digits and - _ . (for example hello, triangle); other folder names are rejected',
            'The approval covers the file named by entry - extra files in the folder are copied by the app but are not part of the computed digest'
          ]
        },
        {
          heading: 'Installation and management',
          body: 'Plugins are managed in the application settings.',
          list: [
            'Settings → Plugins → Install from folder - pick the plugin directory. Files are copied to app data, but every new plugin (including examples) stays disabled.',
            'Clicking the power icon shows permissions, network.allow patterns, hooks and declared visual variants. The code starts only after approval.',
            'Approval covers the declared capabilities AND the plugin entry file. Changing permissions, network, hooks, variants or the code itself requires review again.',
            'Plugins enabled before approval tracking was introduced require a one-time review after updating.',
            'The trash icon uninstalls a plugin and removes its storage and configuration.',
            'Refresh reloads plugins after file edits; if the code or capability set changed, the plugin stays disabled until approved again.',
            'Plugins that declare settings in the manifest get a configuration form on their card.'
          ]
        },
        {
          heading: 'Manifest (manifest.json)',
          body: 'Example manifest.json:',
          code: `«{
  "name": "Example plugin",
  "version": "1.0.0",
  "description": "A demo plugin",
  "author": "Someone",
  "entry": "index.js",
  "apiVersion": "1",
  "permissions": {
    "storage": true,
    "notifications": true
  },
  "hooks": ["app:start", "track:play"]
}»`,
          list: [
            'name - display name; version, description, author - metadata',
            'entry - entry file (default index.js)',
            'apiVersion - plugin API version (currently 1)',
            'permissions - storage, network.allow (array of URL patterns), notifications, player, visual',
            'hooks - hooks the plugin wants to receive',
            'settings - optional list of configuration fields (key, label, type: text|boolean|number, default; min/max for number)',
            'layoutElements - optional list of custom layout variants (element, variant, label); requires the visual permission (described below)',
            'uiSlots - optional list of UI slots the plugin may write to via api.ui (currently audio-view); requires the visual permission and is part of the approval',
            'The id field in the manifest is ignored: the plugin id is the directory name'
          ]
        },
        {
          heading: 'Permissions: what works without extra approval',
          body: 'Read-only queries are available to every plugin, but anything that can change state or see more than the player state sits behind a permission. The full map:',
          list: [
            'No permission needed: player:status, player:progress, library:count, library:search, reading storage and settings (keys outside the manifest are not exposed).',
            'player - the player:play/pause/toggle/next/previous actions, player:setVolume, player:seek, player:enqueue and track:toggleFavorite.',
            'storage - writing and deleting plugin data (api.storage.set/remove).',
            'notifications - api.notify and command notifications.',
            'network - every api.fetch; the URL must additionally match at least one permissions.network.allow pattern.',
            'visual - layout decorations (api.visual), UI slots (api.ui.set/clear) and the player:spectrum query.',
            'Declaring something in the manifest does not enable it: the worker does not start until the user approves, and disabling revokes it immediately.'
          ]
        },
        {
          heading: 'Hooks',
          body: 'Subscribe with api.on(name, handler). The same name must be listed in the hooks array of the manifest.',
          list: [
            'app:start - the plugin worker started; the payload contains no additional data',
            'track:play - the current track changed; payload: title, artist, album, duration, path',
            'track:timeupdate - playback position; sent at most once per second; payload: position, duration, progress, rate, playing, track',
            'track:end - the current track ended; payload contains the current track',
            'track:queued - a track was added to the queue; payload like track:play',
            'library:scan - library scan finished; payload: count',
            'download:start / download:complete / download:error - download state changes and task data'
          ]
        },
        {
          heading: 'API',
          body: 'api is a global object available inside the worker:',
          list: [
            'on(name, fn) / off(name) - hook subscription',
            'query(name, args) - query the application (returns a Promise)',
            'action(name, args) - state-changing action (returns a Promise)',
            'notify(opts) - UI notification',
            'storage.keys() / get(key) / set(key, value) / remove(key) - plugin data',
            'settings.get(key) / set(key, value) - plugin configuration (shared with the card form); set is only allowed for keys declared in the manifest settings',
            'fetch(url, opts) - network through the main-process proxy',
            'registerCommand(cmd) - palette command (returns an unregister function)',
            'visual(key, payload) - audio view element decoration (returns a Promise)',
            'ui.set(slot, items) / ui.clear(slot) - text slot rendered by the host (visual permission + the slot declared in uiSlots)',
            'log.info / warn / error(message) - entries in the Logs tab'
          ]
        },
        {
          heading: 'Queries',
          body: 'query() calls:',
          code: `api.query('player:progress').then(function (p) {
  // position, duration, progress, rate, playing, track
  api.log.info(p.position + ' / ' + p.duration);
});

api.query('player:spectrum', { bins: 32 }).then(function (s) {
  // s.bins - buckets 0..1, s.available tells you whether an AnalyserNode exists
  api.log.info('level: ' + (s.bins[0] || 0).toFixed(2));
});`,
          list: [
            'player:status - player state (currentTrack, isPlaying, volume, shuffle, repeat, queueLength)',
            'player:progress - current position (position, duration, progress, rate, playing, track)',
            'player:spectrum - normalized 0..1 spectrum in «bins» buckets (4-64, 32 by default); requires the visual permission',
            'library:count - number of tracks, audio items and playlists',
            'library:search - results for «query» (optionally capped by «limit»)'
          ]
        },
        {
          heading: 'Actions',
          body: 'action() calls. Player actions require the player permission (except notify):',
          code2: `// Fade-out pattern (same shape as the auto-fade example)
var from = null;
api.on('track:timeupdate', function (payload) {
  var left = payload.duration - payload.position;
  if (left > 8) return;
  if (from === null) {
    api.query('player:status').then(function (s) { from = s.volume; });
    return;
  }
  api.action('player:setVolume', { volume: from * Math.max(0, left / 8) });
});

api.on('track:play', function () {
  if (from !== null) api.action('player:setVolume', { volume: from });
  from = null;
});`,
          list: [
            'player:play / player:pause / player:toggle - playback control',
            'player:next / player:previous - change track',
            'player:setVolume - «volume» from 0 to 1',
            'player:seek - «seconds»: jump to the given second',
            'player:enqueue - «tracks»: array of library track paths added to the queue',
            'notify - «type»: info, success, warning, error; «title»; «message»',
            'track:toggleFavorite - «path»: toggles the track in favorites (player permission)'
          ]
        },
        {
          heading: 'Storage',
          body: 'Every plugin has a private, persistent storage that survives restarts. Keys: letters, digits and - _ . , up to 64 characters; up to 100 keys and 256 KiB of data.',
          list: [
            'api.storage.keys() - list of keys',
            'api.storage.get(key) - value or null',
            'api.storage.set(key, value) - save (the value must be JSON-serializable)',
            'api.storage.remove(key) - delete a key'
          ]
        },
        {
          heading: 'Configuration (settings)',
          body: 'Fields declared in the manifest settings appear as a form on the plugin card. Values are persistent, and api.settings is used to read/write them. Main validates the type and range on write; values incompatible with the current manifest fall back to a valid default or are omitted on read. Undeclared keys are not exposed.',
          code: `«"settings": [
  { "key": "shape", "label": "Default shape", "type": "text", "default": "triangle" },
  { "key": "volume", "label": "Volume", "type": "number", "min": 0, "max": 100 },
  { "key": "notify", "label": "Notifications", "type": "boolean", "default": true }
]»`,
          list: [
            'type - text, boolean or number; text is limited to 4096 UTF-8 bytes, boolean accepts only true/false, and number must be finite and within min/max',
            'default - default value also visible through api.settings.get(key)',
            'api.settings.get(key) - value or null',
            'api.settings.set(key, value) - saves a value matching the declared type and min/max; text is limited to 4096 UTF-8 bytes',
            'Stored values that no longer match a changed schema are ignored; a valid default is used instead'
          ]
        },
        {
          heading: 'Network',
          body: 'api.fetch(url, opts) runs through the main-process proxy. The URL must match permissions.network.allow; hosts resolving to private networks are blocked and every redirect is checked again.',
          code: `«{
  "permissions": {
    "network": { "allow": ["https://httpbin.org/*"] }
  }
}»`,
          list: [
            'Options: «method», «headers», «body», «timeoutMs», «responseType»: "json" or "text"',
            'At most 5 redirects; URL patterns support the «*» wildcard',
            'Headers supplied by the plugin are dropped on cross-origin redirects; cross-origin redirects for POST/PUT/PATCH/DELETE are rejected'
          ]
        },
        {
          heading: 'Command palette',
          body: 'registerCommand({ id, label, icon, location, shortcut, action }):',
          list: [
            'id - unique command id (prefix with the plugin name, e.g. hello:greet)',
            'label - shown on the card and in the palette',
            'icon - optional icon name used by the app (e.g. Triangle, Circle)',
            'location - optional place in the app UI where a button is added; currently audio-view (toolbar of the audio view)',
            'shortcut - optional global keyboard shortcut like "Ctrl+Shift+K" or "Alt+F5"; requires at least one modifier (Ctrl/Meta/Alt/Shift)',
            'Invalid or colliding shortcuts are rejected with a warning in Logs; the shortcut runs the command globally unless a text field is focused',
            'action - called when the command runs (inside the worker); may return a Promise',
            'Commands appear in the command palette (Ctrl+K), as buttons on the plugin card, and as toolbar buttons when location is set'
          ]
        },
        {
          heading: 'Track context menu',
          body: 'A command with location "track-menu" appears in the track context menu (right-click a track in the library). Invoked with the track context:',
          list: [
            'registerCommand({ id, label, location: "track-menu", action }) - action receives an object { id, path, title, artist?, album?, duration?, isOnline } describing the track',
            'The track context menu shows the standard actions (play, favorite, add to queue, etc.) plus, at the end, plugin entries with location: "track-menu"',
            'The context is a snapshot of the track - it reflects the state at the moment the menu was opened',
            'Example: api.registerCommand({ id: "hygge:rate", label: "Rate 5/5", location: "track-menu", action: function (ctx) { ... } })'
          ]
        },
        {
          heading: 'Appearance (visual)',
          body: 'Requires the visual permission. Applies decorations to audio view elements (key element.decoration). Decorations come only from plugins - the app ships no built-in shapes or styles:',
          list: [
            'Allowed elements: cover, visualization, progress, trackInfo, controls',
            'The value is either "none" (clears the decoration) or "plugin:<element>:<variant>" - the variant must be declared in this plugin manifest (layoutElements) and implemented by the host',
            'The host currently implements cover variants: triangle, circle, diamond, hexagon, flip-x',
            'Example: api.visual("element.decoration", { element: "cover", value: "plugin:cover:triangle" }) - the cover is clipped to a triangle',
            'The cover decoration also applies outside the audio view: on the Now Playing screen and in the player bar / other cover surfaces in the UI',
            'Decorations set by a plugin apply globally in the audio view; the layout editor choice (Variant tab → Decoration) is used when no plugin overrides it'
          ]
        },
        {
          heading: 'Custom layout variants (layoutElements)',
          body: 'A plugin can add new decoration options for existing layout elements. Declare them in the manifest (requires permissions.visual). Each entry is an object { element, variant, label? }:',
          code: `«{
  "name": "My plugin",
  "version": "1.0.0",
  "permissions": { "visual": true },
  "layoutElements": [
    { "element": "cover", "variant": "flip-x", "label": "Flip horizontally" }
  ]
}»`,
          list: [
            'element - one of the audio view elements: cover, visualization, progress, trackInfo, controls',
            'variant - identifier matching ^[a-z][a-z0-9-]{0,40}$ (lowercase letters, digits, hyphens)',
            'label - optional display name shown in the layout editor instead of the variant id',
            'The variant appears in the editor (audio view → layout editor → Decoration tab) only while the plugin is active; it is labeled with the plugin name',
            'A variant must be implemented by the host to change the rendering - variants the app does not know are listed but render with no style (safe fallback)',
            'To apply a variant from code use the full value: api.visual("element.decoration", { element: "cover", value: "plugin:cover:flip-x" }) - the value always has the form plugin:<element>:<variant>',
            'The variant must be declared in this plugin manifest and implemented by the host - other plugin values raise "unknown-decoration"',
            'The value is stored in the element decoration, the same way as a built-in one; it also appears in the layout editor when selected'
          ]
        },
        {
          heading: 'UI slots (uiSlots)',
          body: 'A plugin never renders its own HTML and has no DOM access. Instead it can write short text pairs into a slot that the host draws (currently «audio-view» — a bar above the player view). This requires the visual permission and a slot declared in the manifest:',
          code: `«{
  "name": "My plugin",
  "version": "1.0.0",
  "permissions": { "visual": true },
  "uiSlots": ["audio-view"]
}»`,
          code2: `api.ui.set('audio-view', [
  { label: 'Time', value: '01:24 / 03:40' },
  { label: 'File', value: 'Album - Title' }
]);

// An empty list clears the slot:
api.ui.clear('audio-view');`,
          list: [
            'api.ui.set("audio-view", [{ label: "Bitrate", value: "320 kbps" }]) - writes the slot rows',
            'api.ui.clear("audio-view") - clears the slot (also happens when the plugin is disabled)',
            'Host limits: at most 8 rows, 48 characters per label and 160 per value; a larger list is rejected with an error instead of being truncated',
            'Content is rendered as text (no HTML). Control characters are stripped and whitespace collapsed into a single line',
            'Adding a slot changes the approval scope, so the plugin needs a fresh review'
          ]
        },
        {
          heading: 'Debugging',
          body: 'Every plugin card has a Logs section.',
          code: `api.query('player:progress')
  .then(function (progress) {
    api.log.info('position: ' + progress.position);
  })
  .catch(function (err) {
    // the error message is a code, e.g. permission-denied:visual
    api.log.error('failed: ' + err.message);
  });`,
          list: [
            'The Logs section shows api.log.* entries and worker errors. Use api.log.* - console.log stays inside the worker context and never reaches the app.',
            'Every api call returns a Promise, so handle failures in catch; an uncaught error shows up in the logs but does not disable the plugin.',
            'Status: New → Loading → Loaded; startup failures are marked as Error.',
            'After editing plugin files click Refresh to load the new version. A code change invalidates the previous approval, so you have to approve again after the refresh.',
            'Blocking the loop forever leads to worker-heartbeat-timeout - do not run a setTimeout loop synchronously in the worker main body.'
          ]
        },
        {
          heading: 'Minimal plugin step by step',
          body: 'Create a folder named hello with two files. manifest.json:',
          code: `«{
  "name": "Hello",
  "version": "1.0.0",
  "description": "My first plugin",
  "author": "Me",
  "entry": "index.js",
  "permissions": {
    "notifications": true
  }
}»`,
          code2: `api.log.info('hello loaded');

api.on('app:start', function () {
  api.log.info('app started');
});

api.registerCommand({
  id: 'hello:greet',
  label: 'Say hello',
  action: function () {
    return api.notify({ type: 'success', title: 'Hi!', message: 'It works.' });
  }
});`,
          list: [
            'Go to Settings → Plugins → Install from folder and select the hello directory.',
            'Enable the plugin, then check the Logs section and the command button on its card.'
          ]
        },
        {
          heading: 'Troubleshooting',
          body: 'Errors from api calls arrive as a rejected Promise; the message is a code, not a sentence. The most common ones:',
          list: [
            'permission-denied:player / :visual / :storage / :notifications - the manifest is missing that permission. Add it and go through approval again.',
            'unknown-op / unknown-query / unknown-action - a typo in the operation name. Names are case sensitive.',
            'setting-unknown - api.settings.set for a key that is not in the manifest settings.',
            'ui-slot:not-declared - the slot is not listed in manifest.uiSlots; ui-slot:unknown-slot - the app has no such slot.',
            'ui-slot:too-many-items - more than 8 rows; ui-slot:invalid-item - a row is not a label/value object.',
            'plugin-op-args-too-large - arguments exceed 100,000 bytes of JSON; plugin-op-timeout - the host did not answer within 45 s.',
            'worker-ready-timeout - the plugin code threw while starting; worker-heartbeat-timeout - the code blocks the loop (e.g. an endless while).',
            'fetch: forbidden - the URL does not match the allowlist; invalid-url - bad address; redirect-loop - too many redirects; too-large - the response exceeds the limit; network - network or DNS problem.',
            'manifest:missing-name / missing-version / bad-entry - a required field is missing or entry points outside the plugin folder.',
            'A plugin disappears from the list after Refresh - the folder was removed or the manifest stopped parsing (files stay on disk, details are in the app logs).'
          ]
        },
        {
          heading: 'Limits',
          body: 'Hard limits built into the app - worth knowing before designing a plugin:',
          list: [
            'Manifest: 64 KiB; entry file: 1 MiB; at most 20 installed plugins.',
            'Storage: 100 keys, 256 KiB in total; a key is 1-64 characters from [a-zA-Z0-9_.-].',
            'Configuration (settings): text up to 4096 UTF-8 bytes; numbers are bounded by min/max from the manifest.',
            'Hooks: name up to 64 characters; track:timeupdate arrives at most once per second.',
            'Commands: id up to 64 characters, location up to 64, shortcut up to 32 characters.',
            'api.fetch: at most 5 redirects, 30 s timeout, 10 MiB response (1 MiB for text responses).',
            'UI slots: 8 rows, 48 characters per label, 160 per value; api.log truncates an entry to 2000 characters.',
            'An api call: 100,000 bytes of arguments and 45 s for the host response.'
          ]
        },
        {
          heading: 'Bundled examples',
          body: 'The application ships twelve ready-made plugins in resources/plugins-examples — each installs with one click in the Examples section and stays disabled until approved:',
          list: [
            'hello - notifications, player status reads, a storage counter and a network test through api.fetch (httpbin).',
            'triangle - custom cover layout variants (plugin:cover:triangle and friends) plus a palette command.',
            'progress-slot - the safe UI slot: playback position, a level derived from player:spectrum and the file name.',
            'sleep-timer - a sleep timer that counts in the background (survives a restart) and fades the last seconds out; palette commands.',
            'auto-fade - fades the end of every track on its own and restores the volume when the track changes.',
            'Caveat for both: the worker dies with the plugin, so disabling it mid-fade leaves the volume lowered and you have to raise it by hand.',
            'vu-meter - a live level and peak-hold readout in the UI slot, with VU-style attack and release.',
            'focus-mode - a session countdown in the UI slot, pause at the end and start / status / stop commands.',
            'smart-queue - queues the next track after a track ends: no repeats, the same artist preferred, optional random mode.',
            'listen-history - a local listening history: minutes today, top artists this week, recent tracks (nothing leaves the computer).',
            'track-actions - custom entries in the track context menu (queue, favourites, details) plus a "play later" list.',
            'metadata-lookup - checks the release of a track in MusicBrainz (year, album) and shows it in the UI slot; results are cached and the network needs approval.',
            'note-readout - estimates the dominant note from the spectrum and shows it in the slot; it is a rough estimate from a coarse grid, not a tuner.',
            'Plugins with network.allow (hello, metadata-lookup) ask for network access during approval - the host pattern is visible in the dialog.',
            'The examples are the best API documentation: read their index.js to see the calls combined into working code.'
          ]
        },
        {
          heading: 'Limits and safety',
          list: [
            'Plugins have no access to the DOM, Node modules or the application window - only the API above.',
            'Every network request goes through the proxy and is filtered by permissions.network.',
            'Storage is separate for each plugin (per folder).',
            'A missing permission raises permission-denied; unknown operations raise an error.',
            'Disabling or uninstalling a plugin reverts its UI changes (e.g. cover decorations).',
            'Approval is cryptographically tied to the entry file: changing a single character of the code invalidates it and the plugin returns to the disabled state.',
            'UI slots and the spectrum are the only places where plugin content reaches the screen; the app renders them itself, so a plugin cannot inject HTML or scripts.',
            'apiVersion is informational - the app does not reject a plugin based on it, but keep it at 1 until the API changes.'
          ]
        }
      ]
    },
    status: {
      new: 'New',
      loading: 'Loading...',
      loaded: 'Loaded',
      error: 'Error'
    }
  }
};
