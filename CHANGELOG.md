# Changelog

Wszystkie istotne zmiany w projekcie Onda są dokumentowane w tym pliku.

## [0.4.3](https://github.com/gb-redRabit/Onda/compare/v0.4.3...v0.4.3) (2026-09-15)


### Features

* **architecture:** Phase 3 - EventBus, audioEngine class, router await, strict TS, shared constants ([49b1e39](https://github.com/gb-redRabit/Onda/commit/49b1e39a4025a62444fc7ff4dc209d4af8a51944))
* audio PiP — max top position, transparent bg, mode toggle, EQ, next track, UI polish ([fc59729](https://github.com/gb-redRabit/Onda/commit/fc59729ba3f63bbc65a5379b5d4000da7260a1c3))
* audio PiP — wide mode, canvas viz 60fps 192 bars, coverType (image/video), shuffle/repeat state ([3fdc567](https://github.com/gb-redRabit/Onda/commit/3fdc567accc1d542f59f81fed49e6ac6c048025e))
* audio PiP fixes + crossfade removal + cleanup ([0d6ed85](https://github.com/gb-redRabit/Onda/commit/0d6ed852b0ad7d70be0d8dd42a83ebd2d9a694b0))
* **audio:** rebuild audio view with free canvas layout engine ([257efa3](https://github.com/gb-redRabit/Onda/commit/257efa3a0f043c30c2b7143b381443ad5213578c))
* **deps:** self-heal broken binaries and surface a resolver report ([9182515](https://github.com/gb-redRabit/Onda/commit/9182515e184a7a00639a11dfdca929e4f2e1c3b3))
* **diagnostics:** collect recent main-process warnings ([df77200](https://github.com/gb-redRabit/Onda/commit/df77200d1bf28895046a4a6192677e069a9fdfce))
* **explorer:** complete overhaul + ImageViewer lightbox ([30df860](https://github.com/gb-redRabit/Onda/commit/30df8609c8b018df1a6ab4704c113562903b1a20))
* Phase 3b — Audio PiP medium/max modes + settings UI ([e130702](https://github.com/gb-redRabit/Onda/commit/e130702be96782b26a8075297da3ab54955577ae))
* plugin-only decorations, app cache/reset, updater toast, auth & explorer fixes ([fbe1de1](https://github.com/gb-redRabit/Onda/commit/fbe1de15ff4cbcf536d98b308775ebef748f5b3f))
* **release:** instalatory NSIS/dmg/AppImage + auto-release release-please ([315034e](https://github.com/gb-redRabit/Onda/commit/315034ee41226e87c0bb34f0774a5b3b82fa37ca))
* **sources:** download + player + icons + export/import ([391a85d](https://github.com/gb-redRabit/Onda/commit/391a85dfcf2c934c9ceb71ba52ee9a36e69dea95))
* **state:** back up the store before migrations and document persistence ([6fb6b2a](https://github.com/gb-redRabit/Onda/commit/6fb6b2a76b17053f178e530b8def7492b089b371))
* **state:** central migration registry with a schema version ([6c30ae0](https://github.com/gb-redRabit/Onda/commit/6c30ae02bc1cce1031ea9bb0fdfb797bbb492011))
* **themes:** motywy konfigurowalne — 29 zmiennych, 10 motywów wbudowanych, szkło acrylic ([5a50e5d](https://github.com/gb-redRabit/Onda/commit/5a50e5d2afd8b7b35ef3897700dbc7840b7c6f30))
* **ui:** glass radius lock, image viewer window, fx polish ([86d7ba5](https://github.com/gb-redRabit/Onda/commit/86d7ba59331a06b619de77a52cddf13fe1bc2044))
* **ui:** splash renderer-ready + acrylic lifecycle ([68f2843](https://github.com/gb-redRabit/Onda/commit/68f2843a48308e04dd9f81224ed5d2e7e81bf089))
* unified AppMenu — merged TitleBar + TopMenu with view-specific sections ([d46f725](https://github.com/gb-redRabit/Onda/commit/d46f7253be288a8b70a73b37e9e325f92f60bfd9))
* unified AppMenu, delete old TitleBar/TopMenu, fix video covers ([d34266e](https://github.com/gb-redRabit/Onda/commit/d34266ed0c05ae455a71a9f8eaf6e8aed3f3e25b))
* video PiP — maximize button, settings overlay (subs/brightness/contrast), pre-buffer toggle ([6efb0bc](https://github.com/gb-redRabit/Onda/commit/6efb0bc187360beef70c15832b496bf4ed977151))
* video PiP converted to Vue — theme & accent reactivity, pip:theme IPC ([5748b21](https://github.com/gb-redRabit/Onda/commit/5748b21bca7abe77b363d520d479e9431bb80fca))


### Bug Fixes

* AppMenu dropdown closes on mouse move to items ([b4783b6](https://github.com/gb-redRabit/Onda/commit/b4783b65b1a19e257fc3e64199cf244ad5925dd7))
* **audio:** cycle visualization mode via settings, drop fragile viz ref ([5021d4e](https://github.com/gb-redRabit/Onda/commit/5021d4edf19fcbc6b9db9f9e823b7c37ced47dfb))
* brak await na getMkvExtractPath() - czcionki z MKV nie były wyciągane ([978ebb7](https://github.com/gb-redRabit/Onda/commit/978ebb73835b3177971791e835fbd949c5cd6b80))
* **build:** ship splash.html in package, exclude dev dirs from app.asar ([8e4d130](https://github.com/gb-redRabit/Onda/commit/8e4d130e8bc3e2b0c714717193a969f5bf85c40d))
* **build:** unpack sharp native libs, publish installers only ([ac60ea0](https://github.com/gb-redRabit/Onda/commit/ac60ea0e7e6b2c4182c86a08b22f12237f2eb8aa))
* capture video frame via HTML5 canvas as fallback ([8856bf2](https://github.com/gb-redRabit/Onda/commit/8856bf2af13ed35be78db81c82956cff5a65e29f))
* **ci:** bound linux smoke test, assert window-created milestone ([529efd6](https://github.com/gb-redRabit/Onda/commit/529efd6e31a23dd2161f3e65c072ba7b3b7c1a63))
* **ci:** linux ffmpeg source, mac universal sharp, node24 actions, renderer lint ([59b71fc](https://github.com/gb-redRabit/Onda/commit/59b71fca45869b53b3eb75fe816065247c3b7db5))
* **ci:** mac universal native files, deterministic GitHub release ([78554d0](https://github.com/gb-redRabit/Onda/commit/78554d0cb877f3de0288e67f91a43bf8149c2268))
* **ci:** run ensure-release step under bash (fixes pwsh parser error on windows) ([30f4955](https://github.com/gb-redRabit/Onda/commit/30f4955efc4313b665fa97ad6a6fac2d00ba5734))
* **ci:** run linux smoke test headless (xvfb + no-sandbox) ([2865fdc](https://github.com/gb-redRabit/Onda/commit/2865fdc06af2824b307654efbdcecc67d499d970))
* cover change not reflected in library ([7a43f89](https://github.com/gb-redRabit/Onda/commit/7a43f899581fe0fc80032bcaec33a4e335291e2b))
* create + resume AudioContext within user gesture for video ([6014c59](https://github.com/gb-redRabit/Onda/commit/6014c593394a476abe8e47641d405c75f76e4cb2))
* createMediaElementSource before setting video src ([4d24f53](https://github.com/gb-redRabit/Onda/commit/4d24f53faf6f5657cf0c25d2cd82010e4874b872))
* crossfade silence, EQ bypass, preload cleanup, videoSourceNode, destroy ([64cb6e5](https://github.com/gb-redRabit/Onda/commit/64cb6e583c837ec35f7c8113d637c2f58a8f4e98))
* **deps:** allow uninstalling ffprobe, install latest yt-dlp, status bar lists only dependencies with an available update; drop pointless dynamic import of cover-cache. ([3eb2218](https://github.com/gb-redRabit/Onda/commit/3eb221839d91fc8488ae60afa8f97a411ac756d1))
* **deps:** pin managed FFmpeg to an immutable BtbN build via binaries.json ([ce58982](https://github.com/gb-redRabit/Onda/commit/ce589829fa7cbe84fb63d9c4da08ed2840034e35))
* drop createMediaElementSource for videos - play audio natively ([da86a33](https://github.com/gb-redRabit/Onda/commit/da86a33ce33db30cbe4a3fe0685801b1c4d5908d))
* electron-store ESM import - lazy init z dynamic importem ([7f0f333](https://github.com/gb-redRabit/Onda/commit/7f0f333267f25ace3a06912db614e4bfe945dd82))
* ensure IPC-safe state values in useAudioPiP (coerce primitives, slice arrays) ([9e022e2](https://github.com/gb-redRabit/Onda/commit/9e022e22b45f1d0dfc892233b596f66d16085ac7))
* ErrorBoundary brak single root element - warning Transition ([12229f3](https://github.com/gb-redRabit/Onda/commit/12229f38c35c9d33bbf1f7b4b1b54447ea852fe8))
* **explorer:** shell-icon fallback for files without thumbnails ([6b13d09](https://github.com/gb-redRabit/Onda/commit/6b13d09730a780e0ef1413658763a902f4ef9e6b))
* folder type ratio - require &gt;= 70% dominance for pure type ([5c1219a](https://github.com/gb-redRabit/Onda/commit/5c1219a1e1fe0d49a4536ccdbe7972c66b7945cc))
* height chain - main flex-col + ErrorBoundary flex-1 zamiast h-full ([af2977d](https://github.com/gb-redRabit/Onda/commit/af2977d54f6f71e9b8076d0a32eaf6b1beffef12))
* **ipc:** reply to blocked sendSync events and log window load failures ([6382169](https://github.com/gb-redRabit/Onda/commit/6382169b7eba1011f02e72d9b53c0f4480cdce58))
* **musicbrainz:** use typed preload wrappers for tag and cover writes ([ed76834](https://github.com/gb-redRabit/Onda/commit/ed768344a6e0f086d4db5b871458b914dde152e9))
* mute toggle + ui redesign ([8a1f2b2](https://github.com/gb-redRabit/Onda/commit/8a1f2b229e06053bfd0cf01fb803e44a0699d6c9))
* **online:** load channel avatars and banners through main proxy ([48fa8dc](https://github.com/gb-redRabit/Onda/commit/48fa8dc8e5c5787e49938d92320c305894d61627))
* PiP — timeUpdate propagates all fields, buttons work in minimal, cover/EQ fix ([b7d82c4](https://github.com/gb-redRabit/Onda/commit/b7d82c40c0b7c8df5c37f37fc9850fa9e7602e45))
* player shortcuts, playback optimizations and audio visuals ([8823e15](https://github.com/gb-redRabit/Onda/commit/8823e15590956eb7fca9743335cfb7833bcfdd98))
* pre-extract and cache video frame during scan ([4c4d199](https://github.com/gb-redRabit/Onda/commit/4c4d1990d5ccd40f3756e50b60c99f36d162e56a))
* **release:** remove invalid package-name input for v4 ([867f866](https://github.com/gb-redRabit/Onda/commit/867f8662f0e30b1da79fd734e96eb2163cc61f52))
* replace requestIdleCallback with immediate cover loading ([ad38b55](https://github.com/gb-redRabit/Onda/commit/ad38b55279999182d5267ac11ebc4de03a805d5b))
* resume AudioContext when connecting video element ([e313385](https://github.com/gb-redRabit/Onda/commit/e31338534e0d00c51dd459eae8b6db66cc4f5299))
* **security:** enforce plugin permissions and lock down the plugin worker ([bd0ccdb](https://github.com/gb-redRabit/Onda/commit/bd0ccdbd99efe8263ee04f47e118ad1d2da92816))
* **security:** redact secrets from log lines ([036272d](https://github.com/gb-redRabit/Onda/commit/036272d822414ed99df1285d955b2d7c2297898b))
* **settings:** avoid empty i18n key in section header ([df33165](https://github.com/gb-redRabit/Onda/commit/df33165415b4ff0af75ca2a06d05f6e25bd55d52))
* **stability:** Faza 1 - poprawki stabilności (8 zmian) ([74f5e7b](https://github.com/gb-redRabit/Onda/commit/74f5e7bd8c112ad86e07d8a0633b39f9e96c9488))
* **test:** platform-aware path handling for IPC guards and media server ([ee51887](https://github.com/gb-redRabit/Onda/commit/ee51887743db9fdff358dff7751fdf8d0b2b3812))
* **test:** use a writable platform-aware parent for extra-root tests ([ec6b370](https://github.com/gb-redRabit/Onda/commit/ec6b3706f0f84ced76be42fd3a9835a43f713438))
* three-tier video cover loading (IPC, canvas, video element) ([e69389b](https://github.com/gb-redRabit/Onda/commit/e69389b8a235c8951c4cf1aceeffb4a01082a27d))
* transcode unsupported audio codecs (AC3/DTS) for video playback ([b492302](https://github.com/gb-redRabit/Onda/commit/b492302aa62e9897bd189c9dc4e6a8b7291049a6))
* **ui:** correct library tab from downloads; drop status-bar bitrate and progress ([21c0164](https://github.com/gb-redRabit/Onda/commit/21c016465a2108420b66f909469c7c4535e68755))
* video covers, library refresh and status bar polish ([c592a35](https://github.com/gb-redRabit/Onda/commit/c592a352902bf6c4baa19a1ab980d3d5f6326359))
* VideoCard renders first frame via &lt;video&gt; element immediately ([3be5402](https://github.com/gb-redRabit/Onda/commit/3be5402b95c6d984fe4c0bb2010bfcd35cf2ce8a))
* volume distortion, video covers, scan ratio ([a765b32](https://github.com/gb-redRabit/Onda/commit/a765b3212b24d81bce991068e63a4f69f6afeaa0))


### Performance Improvements

* fast chunk-first transcoding for unsupported audio codecs ([212bc76](https://github.com/gb-redRabit/Onda/commit/212bc76e2e14bd19e72a6c9214bdc208692ceaf5))
* **library:** plain-JSON library store (atomic writes + debounce), batched fileMissing/duration IPC, virtualized explorer and playlist views, lighter app search and overview. ([3eb2218](https://github.com/gb-redRabit/Onda/commit/3eb221839d91fc8488ae60afa8f97a411ac756d1))
* **performance:** Faza 2 - poprawki wydajności (7 zmian) ([65ff115](https://github.com/gb-redRabit/Onda/commit/65ff115c83b8e4d3d7994e5e310f6c43a6878b99))


### Miscellaneous Chores

* **ipc:** add channel inventory generator ([a7fce72](https://github.com/gb-redRabit/Onda/commit/a7fce72e4817ba7633542b451bbd59f8df5e9dc9))
* **lint:** allow implicit return types in Node tooling scripts ([f689126](https://github.com/gb-redRabit/Onda/commit/f689126e6ce7b83cfa14efa2962fe02bf07f2d5a))
* **quality:** add empty-catch check + i18n key parity test ([778c0b4](https://github.com/gb-redRabit/Onda/commit/778c0b4c8d30fdcb561db22d5db22dc6383dac10))
* **quality:** replace console calls with logger and drop ts-ignore suppressions ([1141504](https://github.com/gb-redRabit/Onda/commit/1141504ae0170996654a951e7cbdcc28372a3931))
* release 0.4.2 ([27aa754](https://github.com/gb-redRabit/Onda/commit/27aa7549383d540836a538349061c72d9751e719))


### Code Refactoring

* **audio:** extract audio-engine helpers (listeners, normalization, cleanup) ([947cc26](https://github.com/gb-redRabit/Onda/commit/947cc262b21a842dcdf4ac29bb8a36c2a826521f))
* **audio:** extract compact, tall and minimal audio-controls variants ([19279e4](https://github.com/gb-redRabit/Onda/commit/19279e46030ed5cbb1a57a0d409eedeb04a88384))
* **audio:** extract decoration options builder into util ([38d7eb8](https://github.com/gb-redRabit/Onda/commit/38d7eb8fec6db20ca65785d70f4870424ea291b9))
* **audio:** extract drag geometry helpers into util ([6d6dbfe](https://github.com/gb-redRabit/Onda/commit/6d6dbfeb64507365293ebb15526ffb0e9dbee26c))
* **audio:** extract element drag logic into composable ([eba91c8](https://github.com/gb-redRabit/Onda/commit/eba91c80749c51cde40f296e312807b95c3c5129))
* **audio:** extract element style calculation into util ([8501457](https://github.com/gb-redRabit/Onda/commit/8501457ae4bd4cbdc6162c4939fd7902cee76811))
* **audio:** extract immersive mode (HUD, fullscreen, shortcuts) into composable ([6d62e11](https://github.com/gb-redRabit/Onda/commit/6d62e1173f2eaff7113fb378028a40a3986c50d1))
* **audio:** extract layout editor element style into util ([bdc48a1](https://github.com/gb-redRabit/Onda/commit/bdc48a120b2ff97aa364bea633bd92ecb29b075f))
* **audio:** extract the canvas elements and HUD toolbar ([c28610e](https://github.com/gb-redRabit/Onda/commit/c28610ebec459500c681862ab3ba5cfacbb5e80e))
* **audio:** extract wide audio-controls variant ([5f116e3](https://github.com/gb-redRabit/Onda/commit/5f116e30894148650b3c910f16403a50dabe2a27))
* **constants:** split equalizer presets into constants/audio module ([ff1068f](https://github.com/gb-redRabit/Onda/commit/ff1068fda24d424edbf4e3e550dc0b849189d374))
* **cover-cache:** extract store-key crypto helpers into module ([5779508](https://github.com/gb-redRabit/Onda/commit/57795080ab3eaf9e9dd6aad16b6f3b45715975ec))
* dynamic settings tabs and split theme sections ([bfe8f03](https://github.com/gb-redRabit/Onda/commit/bfe8f03103f350fe5331bb4aa62f7d27d5d6d1b0))
* extract audio-layout, endpoint, download-config and musicbrainz helpers ([192e990](https://github.com/gb-redRabit/Onda/commit/192e99097062a4a99a16146a3017c88df81e6350))
* extract download args/snapshot and source-editor helpers ([52669b1](https://github.com/gb-redRabit/Onda/commit/52669b1ce8f6b76d5930fe92d5b69b3def7f6387))
* extract download config form composable ([8a84243](https://github.com/gb-redRabit/Onda/commit/8a84243605d7d41e78a32696db99d105d43f2587))
* extract download profiles card from settings ([dd49914](https://github.com/gb-redRabit/Onda/commit/dd499144381cf7c5b0ca5ddeb056974ca80d6e15))
* extract download row, library toolbar, sources content and layout position tab ([bbf157e](https://github.com/gb-redRabit/Onda/commit/bbf157ed740902c0fe26558f489b6721b06a03f1))
* extract download toolbar component ([a3bceb9](https://github.com/gb-redRabit/Onda/commit/a3bceb9088e57c5cddd5e8deace3cc14fcac9a3e))
* extract downloads and audio view helpers ([5de7e09](https://github.com/gb-redRabit/Onda/commit/5de7e0903907f764a70f3a75b389847369ab2896))
* extract explorer windows and soundcloud stream-cache helpers ([46300c0](https://github.com/gb-redRabit/Onda/commit/46300c03cda30c148d11b5eeb36ecc9551463151))
* extract explorer, audio and video helpers from stores/composables ([96ccd84](https://github.com/gb-redRabit/Onda/commit/96ccd840c431240a7f5e4b5be33f97716de7bbc3))
* extract library tracks bulk bar ([0cfa911](https://github.com/gb-redRabit/Onda/commit/0cfa911b42e8656667cc8f0ab2ebab7a84c73edf))
* extract library tracks empty state ([15dd269](https://github.com/gb-redRabit/Onda/commit/15dd2696dc37cc137a9b62a7fe162de75f8b024a))
* extract mini player bar ([5db40d8](https://github.com/gb-redRabit/Onda/commit/5db40d8855dcf6c68a4bdea1ac6a5efc143c800a))
* extract musicbrainz lookup and subscribe prefs composables ([1b0b195](https://github.com/gb-redRabit/Onda/commit/1b0b1955a45d1897d367e4732e37582180e9bbd8))
* extract pure helpers from sources, library and audio views ([e5886b3](https://github.com/gb-redRabit/Onda/commit/e5886b37527513d8cbecd147cee1629c3e5dd195))
* extract pure helpers from views, stores and dialogs ([68b3299](https://github.com/gb-redRabit/Onda/commit/68b32996e9107aa6d9cf2e90e0dc3d0c02769a5a))
* extract soundcloud fallbacks and splash controller ([537e63f](https://github.com/gb-redRabit/Onda/commit/537e63f329af2c56f11aa58dd329cfb331078bd0))
* extract soundcloud stream/error and visualizer helpers ([081a460](https://github.com/gb-redRabit/Onda/commit/081a460927df25d95c8deea142792cf4199c5e1f))
* extract source-editor, sources and library header sections ([915060a](https://github.com/gb-redRabit/Onda/commit/915060a96685600f8305bba83df53ea1ea03e99d))
* extract subscribe prefs form state and profile mapping ([c042508](https://github.com/gb-redRabit/Onda/commit/c042508c0fd5e6a94f7aa5efbcb313d1533ce175))
* extract subscribe-summary and download-preview components ([0f5bdc7](https://github.com/gb-redRabit/Onda/commit/0f5bdc7ad79f2d38439cd547dae86cfe6cf7d5f5))
* extract window-icon, child-window and tray from main ([f1a1a4c](https://github.com/gb-redRabit/Onda/commit/f1a1a4c7a65d3546e45313d9c5a608bfb8e1f9fd))
* extract youtube stream cache and image viewer window ([a1a2314](https://github.com/gb-redRabit/Onda/commit/a1a23144665b3d26083c17e0fa808fcd491f2c8d))
* **fs:** extract file-properties walk into own module ([e1e64ce](https://github.com/gb-redRabit/Onda/commit/e1e64ce48cb5eb89a72cc224d7884acaf35fc04e))
* **ipc:** single-source contract with generated allowlist and shared OndaAPI ([c80ff29](https://github.com/gb-redRabit/Onda/commit/c80ff2932aa1c885fa6d73772bfbf199d6d415c0))
* **library:** clone persistence payloads with a typed helper ([309952d](https://github.com/gb-redRabit/Onda/commit/309952ddcc716413aee3b3225c0949be90dd8b2d))
* **library:** extract DirNode child-meta computation into util ([3ae9fd9](https://github.com/gb-redRabit/Onda/commit/3ae9fd97b8180f0b109425f03f8583f49c6ff66b))
* **library:** extract tab definitions into util ([1327f86](https://github.com/gb-redRabit/Onda/commit/1327f86a2317619767487d4f913abc9cdeb17b9c))
* **library:** move the tab bar into LibraryTabBar ([35e3d4d](https://github.com/gb-redRabit/Onda/commit/35e3d4d0d023c4c3f8ef3f57a136c6be4a4a3774))
* **library:** narrow MusicBrainz event detail instead of casting ([66c8c22](https://github.com/gb-redRabit/Onda/commit/66c8c2245a7ac5a052df5852024b1d3b15c2c765))
* **media-server:** extract stream proxy into own module ([68fa5a8](https://github.com/gb-redRabit/Onda/commit/68fa5a81ac13fd761c005215ba095164d2c114ce))
* move menu defs to utils, split AppSearch and Sidebar ([fe30d17](https://github.com/gb-redRabit/Onda/commit/fe30d170ff124bb4f30663f80b744ee96c541df7))
* **musicbrainz:** extract batch tagging into useMusicBrainzBatch composable ([09c7b01](https://github.com/gb-redRabit/Onda/commit/09c7b01d4ba98e91fce290b4ee0b0b1251632f7b))
* **musicbrainz:** extract cover fetch/data-url helpers ([e25a8be](https://github.com/gb-redRabit/Onda/commit/e25a8be4d1c5ef5ef021457b0afad064b5ebffc6))
* **musicbrainz:** type emit payload and preview rows without casts ([ea62eb3](https://github.com/gb-redRabit/Onda/commit/ea62eb348eae9d2e7492f5b0d2f79b8b334ca14c))
* **musicbrainz:** type genres and score on the shared release model ([29473b5](https://github.com/gb-redRabit/Onda/commit/29473b5dfc66f52f0e5b785db6015a6bbf9ac781))
* **musicbrainz:** type the scored release response instead of double-casting ([c0f0f7b](https://github.com/gb-redRabit/Onda/commit/c0f0f7bbce45680ff45242badb5c4109e17a7bd6))
* **online:** extract batch file-pick and result message into util ([625cc2e](https://github.com/gb-redRabit/Onda/commit/625cc2ea1b8bf022942fbc9d2a58e5a8f2301f28))
* **online:** extract batch panel state/actions into composable ([d564f55](https://github.com/gb-redRabit/Onda/commit/d564f55ad6a191c57a1bad83e9efef7a075b7af7))
* **online:** extract channel job builder ([c720efa](https://github.com/gb-redRabit/Onda/commit/c720efa8a3beeed321827ca599d8cce9b48b6abc))
* **online:** extract channel state/actions into module ([814cbed](https://github.com/gb-redRabit/Onda/commit/814cbedec49a8dc98de9faaa731cbcc7f440a961))
* **online:** extract channel-prefix URL helper ([6f1779e](https://github.com/gb-redRabit/Onda/commit/6f1779edc84ba4c2f937455368943dec4ab32f1b))
* **online:** extract config-dialog derived values into util ([ede7704](https://github.com/gb-redRabit/Onda/commit/ede7704db0f450bb33c9a962cbae5b0fc1b498cb))
* **online:** extract config-dialog extra payload builder into util ([cab070d](https://github.com/gb-redRabit/Onda/commit/cab070dc686d45b7950a9c5731d50846738d3bf3))
* **online:** extract dialog state and escape handler into composable ([7d916cb](https://github.com/gb-redRabit/Onda/commit/7d916cb4e741451d47f9e209d8e6eae60385238a))
* **online:** extract download-task mapper into own module ([b587272](https://github.com/gb-redRabit/Onda/commit/b5872727145f8dccb02a154abe55f2d69dfa5500))
* **online:** extract downloads list/job submission into module ([df74ab2](https://github.com/gb-redRabit/Onda/commit/df74ab2cd84cf3f4294137cd0c59482058e533a2))
* **online:** extract full-playlist resolver into own module ([141e3a8](https://github.com/gb-redRabit/Onda/commit/141e3a8fd1d08dc2092a51028524889ac0bbc6e0))
* **online:** extract item download-state resolver into util ([0d8f647](https://github.com/gb-redRabit/Onda/commit/0d8f6472c269f0926ee5f4f284ff56d1f721ebef))
* **online:** extract platform link resolver into util ([1d31e84](https://github.com/gb-redRabit/Onda/commit/1d31e84112c1568fecbf99e9552d446184a49339))
* **online:** extract resolved selection and queueing actions into composable ([50a0444](https://github.com/gb-redRabit/Onda/commit/50a044471121c77aefaef2e8d14ae5082a434d49))
* **online:** extract resolved-playlist helpers ([00700da](https://github.com/gb-redRabit/Onda/commit/00700daf7c2c367e84b5238d16acd38b8196c254))
* **online:** extract resolved-playlist loaders into module ([69ae0e1](https://github.com/gb-redRabit/Onda/commit/69ae0e1ddb45a48e1932c168e1470506d73f5362))
* **online:** extract saved-playlist action into composable ([9e2bf3a](https://github.com/gb-redRabit/Onda/commit/9e2bf3a81fa99f433c2dc749abcc946e86a9bf37))
* **online:** extract saved-playlist id helper ([417b0ec](https://github.com/gb-redRabit/Onda/commit/417b0ec2843bbc5b9b3a42ed24c7456aef165d89))
* **online:** extract saved-playlist sync/play into module ([e6ff1d0](https://github.com/gb-redRabit/Onda/commit/e6ff1d01a05a9a491d6ffcb1326aba8aff0ed45f))
* **online:** extract search action into composable ([6674579](https://github.com/gb-redRabit/Onda/commit/6674579244e117b9b785a618b57bf2b20d7be6f6))
* **online:** extract search state/actions into module ([56a4b07](https://github.com/gb-redRabit/Onda/commit/56a4b07a59518ccc6d339a63ee65ab4dedcb2e35))
* **online:** extract stream playback actions into module ([53bffac](https://github.com/gb-redRabit/Onda/commit/53bffac767d73b02a7efea5877d587e563ba7424))
* **online:** extract stream prefetcher into own module ([5c48f02](https://github.com/gb-redRabit/Onda/commit/5c48f02d3da713ac8857d7f446b4e5582bb67231))
* **online:** extract subscriptions collection into module ([d607ef1](https://github.com/gb-redRabit/Onda/commit/d607ef1273dfeec5157ad9f80b732030ae3e17da))
* **online:** extract subscriptions section state/actions into composable ([0ecc462](https://github.com/gb-redRabit/Onda/commit/0ecc462d7c3c3d6dd044440de38be959eed464c3))
* **online:** extract view setup (avatar cache, escape listener, clipboard) into composable ([cf2e0d8](https://github.com/gb-redRabit/Onda/commit/cf2e0d889a18ac97c9de5db7f385f178217638e4))
* **online:** move download queue actions into downloads module ([9327ace](https://github.com/gb-redRabit/Onda/commit/9327acefd3637089362515723880df4402300e19))
* **online:** move download status lookups into downloads module ([5910f2f](https://github.com/gb-redRabit/Onda/commit/5910f2f57fbf37e0481ce194473e695b09f06b02))
* **online:** move queue-confirm, toast and unfollow actions into composables ([063bc88](https://github.com/gb-redRabit/Onda/commit/063bc88402dd1f69e33d1dd61eb9e27c6064057c))
* **online:** move resolve/submit actions into search composable ([21c0ec8](https://github.com/gb-redRabit/Onda/commit/21c0ec8bcfc9bda9226c626a59777920b6b382b6))
* **pip-audio:** extract card and bar-h layouts into components ([8e43bf9](https://github.com/gb-redRabit/Onda/commit/8e43bf90dcd7c5f2609d8117689a5782c85bcc15))
* **pip-audio:** extract shared class constants into pipTheme module ([4318328](https://github.com/gb-redRabit/Onda/commit/43183281ce9e1ac99222ca7c3e1be349333dc638))
* **pip-audio:** extract vertical layout into PipStackLayout ([699bebd](https://github.com/gb-redRabit/Onda/commit/699bebd088614d87af164ee22fd7eab117f4eefb))
* **pip-audio:** move root/peek class logic into pipTheme ([65150a3](https://github.com/gb-redRabit/Onda/commit/65150a3c9fe88748116530d5f656db76b10f559a))
* **pip:** dedupe peek/unpeek into a shared setPeeked helper ([38d62bb](https://github.com/gb-redRabit/Onda/commit/38d62bb3142dbd6a6dc62ce047dbd5a6eb899ffe))
* **pip:** extract default layout elements and preview state ([d5cd93d](https://github.com/gb-redRabit/Onda/commit/d5cd93d426b0481d43dccc3f6cb9147219583b7a))
* **pip:** extract the audio PiP peek state machine ([842eb99](https://github.com/gb-redRabit/Onda/commit/842eb99a57da0ce5bf1dbdf719b0c190bea99d8d))
* **player-cover:** use the typed duration batch API ([4082f53](https://github.com/gb-redRabit/Onda/commit/4082f5379d5a1d86d5953f6f796a5fb128fc785a))
* **player:** extract speed menu into PlayerSpeedMenu component ([deaff7d](https://github.com/gb-redRabit/Onda/commit/deaff7d1fa6dcb155af5383af9f87cba367bc5c5))
* **plugins:** dedupe record-key removal in terminatePlugin ([bb66545](https://github.com/gb-redRabit/Onda/commit/bb66545797dc4a07f20a08c30c6053eac4e54b60))
* **plugins:** extract derive/compute helpers into util ([9e7bb56](https://github.com/gb-redRabit/Onda/commit/9e7bb56e71ae13eabcaa040b598b0ce5b1027223))
* **quality:** log best-effort IPC failures with context ([84030f3](https://github.com/gb-redRabit/Onda/commit/84030f352466a40906002f6e2f0067ae7c7885f8))
* **settings:** extract appearance migration into module ([13d4b67](https://github.com/gb-redRabit/Onda/commit/13d4b674d68526a39fdfa51a7ab9a493b927f02e))
* **settings:** extract section/tab navigation into composable ([0fc63d1](https://github.com/gb-redRabit/Onda/commit/0fc63d1dc896d57a55e90333a5e9258f447a1b45))
* **soundcloud:** extract search offset clamp into util ([c659e69](https://github.com/gb-redRabit/Onda/commit/c659e698c86de32e14266564b6e0dc848ebc799d))
* **soundcloud:** extract track resolve mapper into module ([e7f5cad](https://github.com/gb-redRabit/Onda/commit/e7f5cad6d9e712ce4635f7ed2b57e13d1996123a))
* **sources:** extract endpoint-name and URL helpers into util ([15c3aaf](https://github.com/gb-redRabit/Onda/commit/15c3aafee88b28a233b9bacc4b2ac5be52435832))
* **sources:** extract navigation pass-context helpers into util ([ab042d3](https://github.com/gb-redRabit/Onda/commit/ab042d3f6abd14d77db872b0e37149d8caa0911f))
* **sources:** extract the sidebar and the transient toast ([5726ee4](https://github.com/gb-redRabit/Onda/commit/5726ee4f145d799cd30aac8c5af533062d84cc1c))
* split audio layout editor right panel ([fccc8dc](https://github.com/gb-redRabit/Onda/commit/fccc8dc7b4d0197de9dfa0a8ac309cb1ed93a9c1))
* split constants, StatusBar and App IPC wiring ([bf91bbb](https://github.com/gb-redRabit/Onda/commit/bf91bbb56f1acb1096605dc189ea0296a23afd6e))
* split download dialog format and cover sections ([823d252](https://github.com/gb-redRabit/Onda/commit/823d2526d3168c1882e98e9c8c66206ee6206f3c))
* split download dialog sections, endpoint pass-keys/table; add channel loader ([2aafac3](https://github.com/gb-redRabit/Onda/commit/2aafac341f8c272f69f833e9120b547d507e5517))
* split downloads view into row-actions, filters and meta components ([e215c3b](https://github.com/gb-redRabit/Onda/commit/e215c3b9257e7f354c47555e25994f8cc9c950cc))
* split ipc types and extract state factories from stores ([48dfeb6](https://github.com/gb-redRabit/Onda/commit/48dfeb68b8ff2960979316941bee2e270c9ecac6))
* split musicbrainz lookup and audio-controls micro variant ([3d1673d](https://github.com/gb-redRabit/Onda/commit/3d1673d2b3245bdf7cd1f939701a826883bc9855))
* split online channel header and infinite scroll ([19ae30f](https://github.com/gb-redRabit/Onda/commit/19ae30f7b8e9d94e88c709c7e094b40284aaae71))
* split online media card and dir node ([b615380](https://github.com/gb-redRabit/Onda/commit/b61538071eeb76781d05f0b80bc793876b0e477c))
* split online view and app menu sections ([8e14713](https://github.com/gb-redRabit/Onda/commit/8e14713459ce5e42cf03afcd9f2ea96ac96c5142))
* split online, webcast, sources and musicbrainz views into panels ([395bfaf](https://github.com/gb-redRabit/Onda/commit/395bfaf28861df760ab62448a7981a3f3ea62f38))
* split plugin store, settings persistence and context-menu defs ([2c69429](https://github.com/gb-redRabit/Onda/commit/2c69429d27645a94b151c2b59c7d5227ff6ca27b))
* split subscribe dialog into section components ([75eedd3](https://github.com/gb-redRabit/Onda/commit/75eedd3523f90ca65868d47aae5d099b01441cf1))
* split subscribe profile and cover sections ([279ab60](https://github.com/gb-redRabit/Onda/commit/279ab60302cfd119f84a2d2e7ac4616362a74a04))
* split youtube auth session and cover cache store ([e3bc285](https://github.com/gb-redRabit/Onda/commit/e3bc2851f9c065be7d772752f10298cdb2c463ad))
* split youtube stream, soundcloud fallback and audio engine helpers ([c337cf9](https://github.com/gb-redRabit/Onda/commit/c337cf95622416b87b9a983adbfc4a6cf684a30c))
* **theme:** extract color-token groups into shared util ([48ec735](https://github.com/gb-redRabit/Onda/commit/48ec735bbfd348c70092b159a9d06d0c0a4d915a))
* **types:** drop six redundant as-unknown-as casts ([fe14be7](https://github.com/gb-redRabit/Onda/commit/fe14be74e4577eb951cba0b29ec315e0ee0daf20))
* **types:** use typed preload wrappers for licenses and MB covers ([b811476](https://github.com/gb-redRabit/Onda/commit/b811476294ebcfdacf3659409691fa5019eb354b))
* **visualizer:** extract analyser buffers into util ([dd5c5d1](https://github.com/gb-redRabit/Onda/commit/dd5c5d1f3a5612480b9a089dd03036474ae021c3))
* **visualizer:** extract frequency binning + scratch into util ([419e8ba](https://github.com/gb-redRabit/Onda/commit/419e8bae0f32520237c13c10d496466d7a864fcf))
* **visualizer:** extract gradient caches into util ([b80ba12](https://github.com/gb-redRabit/Onda/commit/b80ba128c07658e5e972f05050f351fb2d139298))
* **visualizer:** extract radial and circle draw helpers ([e0a43b4](https://github.com/gb-redRabit/Onda/commit/e0a43b402a0a5dbb6ed81baf5ee1c7e17b147b54))
* **visualizer:** extract viz config cache into composable ([e8fe913](https://github.com/gb-redRabit/Onda/commit/e8fe9133fef79187627247fb5801dce22539e4d3))
* **visualizer:** move bars/spectrum/wave/rings draw into shared module ([4368a15](https://github.com/gb-redRabit/Onda/commit/4368a15f2d9ac6d3a5269b15a55c62624a94ef13))
* **window-ipc:** replace double casts with a named bounds type ([57576c2](https://github.com/gb-redRabit/Onda/commit/57576c284af2296a40af3c5a18ad136a2dd2fd1e))
* **youtube-auth:** extract auth settings accessors into own module ([4e81fe4](https://github.com/gb-redRabit/Onda/commit/4e81fe4f802eedd3dc9c892997d360b075bbff0b))
* **youtube-auth:** extract cookie/session helpers ([af5c1a8](https://github.com/gb-redRabit/Onda/commit/af5c1a80ee9d6aaaa277ac2b181ecf1f259aaf48))
* **youtube:** extract yt-dlp fetch helpers into module ([1e120aa](https://github.com/gb-redRabit/Onda/commit/1e120aa1391a5f346abd041bf0f4dc01ddd42568))


### Tests

* **e2e:** add Playwright Electron smoke suite ([057b6bd](https://github.com/gb-redRabit/Onda/commit/057b6bd6c392499f429d27bedbb431882a87a11c))
* **e2e:** cover audio PiP show and hide ([da48e19](https://github.com/gb-redRabit/Onda/commit/da48e19ad1552ecc6b1e4f515d8bbbd8593d8926))
* **e2e:** cover library scan and WAV playback ([aac2580](https://github.com/gb-redRabit/Onda/commit/aac25808efee00b454e87dd988803a2886467bd7))
* **e2e:** cover online search and the download queue with fixtures ([78042f2](https://github.com/gb-redRabit/Onda/commit/78042f2afccf3b5acbfdf4f2c3672c58e0dca245))
* **e2e:** migrate a legacy hostname-keyed profile at boot ([54c54d6](https://github.com/gb-redRabit/Onda/commit/54c54d6cda58d411ebf6efd2ae2b58740d7aeb3d))
* **ipc:** assert contract and ipcMain.handle match in both directions ([d1a96ad](https://github.com/gb-redRabit/Onda/commit/d1a96adc3609d238132449433f622cead3cf5bb2))
* **ipc:** assert renderer invoke channels are allowlisted in preload ([3db2671](https://github.com/gb-redRabit/Onda/commit/3db267189f47a11d5b015e4559a3cc73b82d54d6))
* **security:** exercise media-server path guards negatively ([f74c94c](https://github.com/gb-redRabit/Onda/commit/f74c94c36c3dbe653d3cd79d9f0196babcf68f81))
* **security:** use an existing symlink target on macOS ([9040026](https://github.com/gb-redRabit/Onda/commit/90400261dee9fa8168196d48b0fceeee843e3636))


### Continuous Integration

* **e2e:** annotate Playwright failures and upload reports ([3f79a24](https://github.com/gb-redRabit/Onda/commit/3f79a24394400d75af43b45edec9a093f885fec0))

## [0.4.2](https://github.com/gb-redRabit/Onda/compare/v0.4.2...v0.4.2) (2026-09-12)


### Features

* **architecture:** Phase 3 - EventBus, audioEngine class, router await, strict TS, shared constants ([49b1e39](https://github.com/gb-redRabit/Onda/commit/49b1e39a4025a62444fc7ff4dc209d4af8a51944))
* audio PiP — max top position, transparent bg, mode toggle, EQ, next track, UI polish ([fc59729](https://github.com/gb-redRabit/Onda/commit/fc59729ba3f63bbc65a5379b5d4000da7260a1c3))
* audio PiP — wide mode, canvas viz 60fps 192 bars, coverType (image/video), shuffle/repeat state ([3fdc567](https://github.com/gb-redRabit/Onda/commit/3fdc567accc1d542f59f81fed49e6ac6c048025e))
* audio PiP fixes + crossfade removal + cleanup ([0d6ed85](https://github.com/gb-redRabit/Onda/commit/0d6ed852b0ad7d70be0d8dd42a83ebd2d9a694b0))
* **audio:** rebuild audio view with free canvas layout engine ([257efa3](https://github.com/gb-redRabit/Onda/commit/257efa3a0f043c30c2b7143b381443ad5213578c))
* **explorer:** complete overhaul + ImageViewer lightbox ([30df860](https://github.com/gb-redRabit/Onda/commit/30df8609c8b018df1a6ab4704c113562903b1a20))
* Phase 3b — Audio PiP medium/max modes + settings UI ([e130702](https://github.com/gb-redRabit/Onda/commit/e130702be96782b26a8075297da3ab54955577ae))
* **release:** instalatory NSIS/dmg/AppImage + auto-release release-please ([315034e](https://github.com/gb-redRabit/Onda/commit/315034ee41226e87c0bb34f0774a5b3b82fa37ca))
* **sources:** download + player + icons + export/import ([391a85d](https://github.com/gb-redRabit/Onda/commit/391a85dfcf2c934c9ceb71ba52ee9a36e69dea95))
* **themes:** motywy konfigurowalne — 29 zmiennych, 10 motywów wbudowanych, szkło acrylic ([5a50e5d](https://github.com/gb-redRabit/Onda/commit/5a50e5d2afd8b7b35ef3897700dbc7840b7c6f30))
* **ui:** glass radius lock, image viewer window, fx polish ([86d7ba5](https://github.com/gb-redRabit/Onda/commit/86d7ba59331a06b619de77a52cddf13fe1bc2044))
* **ui:** splash renderer-ready + acrylic lifecycle ([68f2843](https://github.com/gb-redRabit/Onda/commit/68f2843a48308e04dd9f81224ed5d2e7e81bf089))
* unified AppMenu — merged TitleBar + TopMenu with view-specific sections ([d46f725](https://github.com/gb-redRabit/Onda/commit/d46f7253be288a8b70a73b37e9e325f92f60bfd9))
* unified AppMenu, delete old TitleBar/TopMenu, fix video covers ([d34266e](https://github.com/gb-redRabit/Onda/commit/d34266ed0c05ae455a71a9f8eaf6e8aed3f3e25b))
* video PiP — maximize button, settings overlay (subs/brightness/contrast), pre-buffer toggle ([6efb0bc](https://github.com/gb-redRabit/Onda/commit/6efb0bc187360beef70c15832b496bf4ed977151))
* video PiP converted to Vue — theme & accent reactivity, pip:theme IPC ([5748b21](https://github.com/gb-redRabit/Onda/commit/5748b21bca7abe77b363d520d479e9431bb80fca))


### Bug Fixes

* AppMenu dropdown closes on mouse move to items ([b4783b6](https://github.com/gb-redRabit/Onda/commit/b4783b65b1a19e257fc3e64199cf244ad5925dd7))
* brak await na getMkvExtractPath() - czcionki z MKV nie były wyciągane ([978ebb7](https://github.com/gb-redRabit/Onda/commit/978ebb73835b3177971791e835fbd949c5cd6b80))
* **build:** ship splash.html in package, exclude dev dirs from app.asar ([8e4d130](https://github.com/gb-redRabit/Onda/commit/8e4d130e8bc3e2b0c714717193a969f5bf85c40d))
* **build:** unpack sharp native libs, publish installers only ([ac60ea0](https://github.com/gb-redRabit/Onda/commit/ac60ea0e7e6b2c4182c86a08b22f12237f2eb8aa))
* capture video frame via HTML5 canvas as fallback ([8856bf2](https://github.com/gb-redRabit/Onda/commit/8856bf2af13ed35be78db81c82956cff5a65e29f))
* **ci:** bound linux smoke test, assert window-created milestone ([529efd6](https://github.com/gb-redRabit/Onda/commit/529efd6e31a23dd2161f3e65c072ba7b3b7c1a63))
* **ci:** linux ffmpeg source, mac universal sharp, node24 actions, renderer lint ([59b71fc](https://github.com/gb-redRabit/Onda/commit/59b71fca45869b53b3eb75fe816065247c3b7db5))
* **ci:** mac universal native files, deterministic GitHub release ([78554d0](https://github.com/gb-redRabit/Onda/commit/78554d0cb877f3de0288e67f91a43bf8149c2268))
* **ci:** run ensure-release step under bash (fixes pwsh parser error on windows) ([30f4955](https://github.com/gb-redRabit/Onda/commit/30f4955efc4313b665fa97ad6a6fac2d00ba5734))
* **ci:** run linux smoke test headless (xvfb + no-sandbox) ([2865fdc](https://github.com/gb-redRabit/Onda/commit/2865fdc06af2824b307654efbdcecc67d499d970))
* cover change not reflected in library ([7a43f89](https://github.com/gb-redRabit/Onda/commit/7a43f899581fe0fc80032bcaec33a4e335291e2b))
* create + resume AudioContext within user gesture for video ([6014c59](https://github.com/gb-redRabit/Onda/commit/6014c593394a476abe8e47641d405c75f76e4cb2))
* createMediaElementSource before setting video src ([4d24f53](https://github.com/gb-redRabit/Onda/commit/4d24f53faf6f5657cf0c25d2cd82010e4874b872))
* crossfade silence, EQ bypass, preload cleanup, videoSourceNode, destroy ([64cb6e5](https://github.com/gb-redRabit/Onda/commit/64cb6e583c837ec35f7c8113d637c2f58a8f4e98))
* drop createMediaElementSource for videos - play audio natively ([da86a33](https://github.com/gb-redRabit/Onda/commit/da86a33ce33db30cbe4a3fe0685801b1c4d5908d))
* electron-store ESM import - lazy init z dynamic importem ([7f0f333](https://github.com/gb-redRabit/Onda/commit/7f0f333267f25ace3a06912db614e4bfe945dd82))
* ensure IPC-safe state values in useAudioPiP (coerce primitives, slice arrays) ([9e022e2](https://github.com/gb-redRabit/Onda/commit/9e022e22b45f1d0dfc892233b596f66d16085ac7))
* ErrorBoundary brak single root element - warning Transition ([12229f3](https://github.com/gb-redRabit/Onda/commit/12229f38c35c9d33bbf1f7b4b1b54447ea852fe8))
* folder type ratio - require &gt;= 70% dominance for pure type ([5c1219a](https://github.com/gb-redRabit/Onda/commit/5c1219a1e1fe0d49a4536ccdbe7972c66b7945cc))
* height chain - main flex-col + ErrorBoundary flex-1 zamiast h-full ([af2977d](https://github.com/gb-redRabit/Onda/commit/af2977d54f6f71e9b8076d0a32eaf6b1beffef12))
* mute toggle + ui redesign ([8a1f2b2](https://github.com/gb-redRabit/Onda/commit/8a1f2b229e06053bfd0cf01fb803e44a0699d6c9))
* PiP — timeUpdate propagates all fields, buttons work in minimal, cover/EQ fix ([b7d82c4](https://github.com/gb-redRabit/Onda/commit/b7d82c40c0b7c8df5c37f37fc9850fa9e7602e45))
* player shortcuts, playback optimizations and audio visuals ([8823e15](https://github.com/gb-redRabit/Onda/commit/8823e15590956eb7fca9743335cfb7833bcfdd98))
* pre-extract and cache video frame during scan ([4c4d199](https://github.com/gb-redRabit/Onda/commit/4c4d1990d5ccd40f3756e50b60c99f36d162e56a))
* **release:** remove invalid package-name input for v4 ([867f866](https://github.com/gb-redRabit/Onda/commit/867f8662f0e30b1da79fd734e96eb2163cc61f52))
* replace requestIdleCallback with immediate cover loading ([ad38b55](https://github.com/gb-redRabit/Onda/commit/ad38b55279999182d5267ac11ebc4de03a805d5b))
* resume AudioContext when connecting video element ([e313385](https://github.com/gb-redRabit/Onda/commit/e31338534e0d00c51dd459eae8b6db66cc4f5299))
* **stability:** Faza 1 - poprawki stabilności (8 zmian) ([74f5e7b](https://github.com/gb-redRabit/Onda/commit/74f5e7bd8c112ad86e07d8a0633b39f9e96c9488))
* **test:** platform-aware path handling for IPC guards and media server ([ee51887](https://github.com/gb-redRabit/Onda/commit/ee51887743db9fdff358dff7751fdf8d0b2b3812))
* **test:** use a writable platform-aware parent for extra-root tests ([ec6b370](https://github.com/gb-redRabit/Onda/commit/ec6b3706f0f84ced76be42fd3a9835a43f713438))
* three-tier video cover loading (IPC, canvas, video element) ([e69389b](https://github.com/gb-redRabit/Onda/commit/e69389b8a235c8951c4cf1aceeffb4a01082a27d))
* transcode unsupported audio codecs (AC3/DTS) for video playback ([b492302](https://github.com/gb-redRabit/Onda/commit/b492302aa62e9897bd189c9dc4e6a8b7291049a6))
* video covers, library refresh and status bar polish ([c592a35](https://github.com/gb-redRabit/Onda/commit/c592a352902bf6c4baa19a1ab980d3d5f6326359))
* VideoCard renders first frame via &lt;video&gt; element immediately ([3be5402](https://github.com/gb-redRabit/Onda/commit/3be5402b95c6d984fe4c0bb2010bfcd35cf2ce8a))
* volume distortion, video covers, scan ratio ([a765b32](https://github.com/gb-redRabit/Onda/commit/a765b3212b24d81bce991068e63a4f69f6afeaa0))


### Performance Improvements

* fast chunk-first transcoding for unsupported audio codecs ([212bc76](https://github.com/gb-redRabit/Onda/commit/212bc76e2e14bd19e72a6c9214bdc208692ceaf5))
* **performance:** Faza 2 - poprawki wydajności (7 zmian) ([65ff115](https://github.com/gb-redRabit/Onda/commit/65ff115c83b8e4d3d7994e5e310f6c43a6878b99))


### Miscellaneous Chores

* release 0.4.2 ([27aa754](https://github.com/gb-redRabit/Onda/commit/27aa7549383d540836a538349061c72d9751e719))

## [0.4.2](https://github.com/gb-redRabit/Onda/compare/v0.4.1...v0.4.2) (2026-09-12)


### Bug Fixes

* **ci:** run ensure-release step under bash (fixes pwsh parser error on windows) ([30f4955](https://github.com/gb-redRabit/Onda/commit/30f4955efc4313b665fa97ad6a6fac2d00ba5734))

## [0.4.1](https://github.com/gb-redRabit/Onda/compare/v0.4.0...v0.4.1) (2026-09-12)


### Bug Fixes

* **build:** unpack sharp native libs, publish installers only ([ac60ea0](https://github.com/gb-redRabit/Onda/commit/ac60ea0e7e6b2c4182c86a08b22f12237f2eb8aa))
* **ci:** bound linux smoke test, assert window-created milestone ([529efd6](https://github.com/gb-redRabit/Onda/commit/529efd6e31a23dd2161f3e65c072ba7b3b7c1a63))
* **ci:** run linux smoke test headless (xvfb + no-sandbox) ([2865fdc](https://github.com/gb-redRabit/Onda/commit/2865fdc06af2824b307654efbdcecc67d499d970))

## [Nieopublikowane]

### Naprawy bezpieczeństwa

- Media server działa teraz fail-closed — pusta whitelistta korzeni odrzuca wszystkie żądania (wcześniej przy pustej liście obsługiwał dowolną ścieżkę absolutną).
- Rooty media servera pochodzą wyłącznie z jawnie otwartych plików/folderów (biblioteka, dialogi, pliki z systemu, `media:grantAccess`), a nie z każdego przeglądanego folderu.
- Import ustawień szyfruje klucze API przed zapisem; eksport nie wypisuje sekretów (klucze API, hasło proxy).
- Guard IPC ufa tylko stronie aplikacji (`app.getAppPath()`), a nie dowolnemu URL `file:`.
- Walidacja runtime argumentów IPC dla operacji plikowych (`fs:*`), mediów i napisów (`utils/validate.ts`); zakładki/kanaly YouTube mają ograniczone zakresy, a downloader odrzuca URL-e spoza YouTube.
- Downloader zależności: limit redirectów, wymuszony HTTPS, limit rozmiaru, zapis do pliku tymczasowego z atomowym rename, timeout.
- Otwieranie plików wykonywalnych przez `shell:openWithDefault` wymaga potwierdzenia; `.lnk`/`.url` blokowane.
- `media:batchThumbnails` dodane do allowlisty preload.

### Naprawy błędów

- Przycisk „Dodaj do kolejki" na pojedynczym filmie (YouTube) nie usuwa już zaznaczenia i nie pomija dodawania.
- Ekran pobierania pokazuje właściwą finalną ścieżkę pliku (`outputPath`), a retry używa katalogu (`outputDir`).
- Ładowanie kanału YouTube nie pozostaje w stanie ładowania po błędzie (try/finally + identyfikator generacji).
- Wyścigi przy szybkiej zmianie filmu w napisach i transkodowaniu (identyfikatory generacji).
- Reset ustawień przywraca teraz grupy `explorer` i `library`.
- Nieznane rozszerzenia plików są klasyfikowane jako `unknown` (nie `video`).
- Cache miniatur i transkodów uwzględnia `mtime`, więc nadpisany plik nie pokazuje starych danych.

### Nowe funkcje

- **System wtyczek**: instalacja z folderu, lista/aktywacja/dezaktywacja/odinstalowanie, worker na wtyczkę (sandbox), karta wtyczki w Ustawieniach z Logami i statusem, manifest (uprawnienia: storage/notifications/player/visual) oraz poradnik PL/EN w Ustawieniach.
  - **Hooki i akcje**: `library:scan`, `track:queued` (hooki) oraz `player:seek`, `player:enqueue`, `track:toggleFavorite` (akcje) przez `api.on`/`api.action`.
  - **Komendy** — `api.registerCommand({ id, label, icon, action })` dostępne w palecie poleceń, na karcie wtyczki i (przy `location`) w UI.
  - **Konfiguracja** — pole `settings` w manifeście + formularz na karcie; `api.settings.get/set` (IPC `plugins:settings:*`, plik `settings.json` per wtyczka, walidacja kluczy/typów/min-max).
  - **Dekoracje** — `api.visual('element.decoration', { element, value })` nadaje dekoracje elementom widoku audio (cover/visualization/progress/trackInfo/controls), obejmuje też „Teraz odtwarzane" i mini-pasek.
  - **Skróty klawiszowe** — `api.registerCommand({ ..., shortcut })` z walidacją i odrzucaniem kolizji (ostrzeżenie w Logach); globalne działanie poza polami tekstowymi.
  - **Menu kontekstowe utworu** — komenda z `location: 'track-menu'` pojawia się w menu kontekstowym utworu w bibliotece, a `action` dostaje snapshot utworu `{ id, path, title, artist?, album?, duration?, isOnline }`.
- **Streaming online YouTube**: przycisk „Odtwórz" na kartach wyników; resolve strumienia przez yt-dlp (`-g`) + proxy media-server (CORS/range/retry 403), kolejka streamów z auto-next, cache URL-i (LRU + persystencja na dysku, TTL 5 h), prefetch przy najechaniu/podglądzie karty, status „Łączenie…/Buforowanie…" w stopce.
- **Widok „Zapisane"** (`/saved`): zapisane utwory i playlisty (bookmark na kartach), odtwarzanie playlisty live re-resolve, persystencja `saved-streams.json` (limity 500/100).
- **SoundCloud + multi-platform** (`/online`): własny klient wewnętrznego API `api-v2.soundcloud.com` (client_id wyekstrahowany z bundli, cache 24 h, refresh na 401) z automatycznym fallbackiem na yt-dlp; search/resolve/kanały (obserwujący/utwory, banner = avatar); streaming progressive MP3 przez proxy z cache respektującym ~30-minutową ważność podpisów CDN; pobieranie MP3 jako job HTTP (świeży podpisany URL przy każdej próbie). Przełącznik platform YouTube | SoundCloud, redirect `/youtube` → `/online`.
- **Subskrypcje SoundCloud**: obserwowanie artystów z pełnym auto-download nowych utworów (MP3 przez API), „pobierz wszystko" dla całego profilu, uproszczony dialog konfiguracji (folder/szablon/biblioteka), badge „SC" na karcie subskrypcji.
- **SoundCloud — domknięcie**: pobrane MP3 dostają tagi ID3 (tytuł/wykonawca) i okładkę z artwork_url; „Zapisane" obsługują SC (bookmark na kartach, zapisane sety/utwory odtwarzane po permalink); batch przyjmuje linki obu platform; utwory bez progressive transcoding pobierają się przez yt-dlp (HLS/ffmpeg); fallback yt-dlp dla snapshotu całego profilu.
- Autostart: grupa ustawień „Ogólne" (`autoLaunch`, `startMinimized`, `closeToTray`), IPC `app:getAutoLaunch`/`app:setAutoLaunch`, start zminimalizowany przez `--hidden`.
- Single-instance + otwieranie plików z systemu (`second-instance`, `open-file`, `process.argv`) i skojarzenia plików (`fileAssociations`).
- Anulowanie skanowania biblioteki (`library:scanCancel`) z przyciskiem w UI; incremental scan (niezmienione pliki są ponownie używane) i watcher plików (`chokidar`).
- Media Session API (metadata + play/pause/next/previous/seekto + artwork).

### Ulepszenia

- Optymalizacja systemu wtyczek: `logPush` bez przebudowy całej mapy logów przy każdym wpisie (mutacja w miejscu), równoległe ładowanie ustawień per-wtyczka (`Promise.all`), `dispatchCommand` trasuje bezpośrednio do workera właściciela (bez iteracji po wszystkich workerach).
- Naprawa rozwijanego panelu Logi na karcie wtyczki (niereaktywny `Set` → `ref<Set>`; wcześniej nie rozwijał się po kliknięciu).
- Hardening streamingu YT: klienty `ios_safari,tv_embedded` (audio-only itag 251, ~2× szybszy resolve) z fallbackiem `android,web`, proxy 4 próby z backoffem, fallback direct w audioEngine, kanał nightly yt-dlp.
- Pozycja odtwarzania persistowana między restartami (`electron-store`, limit 500 wpisów).
- Timeout pojedynczego zadania pobierania (30 min), wznowienie przerwanego pobierania (`--continue`) oraz limity `maxConcurrent` (10) i bufora `stderr` (64 KB).
- Limit czasu całego checkera subskrypcji (10 min).
- Miniatury YouTube z `loading="lazy"`; globalny `prefers-reduced-motion` w CSS; `aria-label` na kontrolerach odtwarzania i nawigacji.
- Instalator: `appId: com.onda.app`, `productName: Onda`, assisted NSIS z wyborem katalogu.
- Lint przechodzi (skrypt `generate-random-icon.js` wyłączony z lint).

### Dokumentacja

- `README.md` zaktualizowane (licznik testów — 703, sekcja systemu wtyczek).
- `LICENSE`: właściciel „Onda Contributors"; `SettingsAbout.vue` linkuje do realnego repozytorium.
- `RELEASE.md` z procedurą wydania; konfiguracja podpisywania przygotowana w `electron-builder.yml`/`build.yml` (aktywacja po dostarczeniu certyfikatów).
