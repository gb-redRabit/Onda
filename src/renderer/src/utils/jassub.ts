import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import defaultFontUrl from 'jassub/dist/default.woff2?url';

interface CreateJassubParams {
  video: HTMLVideoElement;
  subContent: string;
  fonts: Uint8Array[];
  availableFonts: Record<string, string>;
  timeOffset?: number;
  queryFonts?: false | 'local' | 'localandremote';
  defaultFont?: string;
  workerUrlOverride?: string;
  wasmUrlOverride?: string;
  modernWasmUrlOverride?: string;
}

interface JassubWasmDataUrls {
  wasmDataUrl: string;
  modernWasmDataUrl: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
  return btoa(chars.join(''));
}

export async function loadJassubWasmDataUrls(): Promise<JassubWasmDataUrls> {
  const [wasmData, modernWasmData] = await Promise.all([
    fetch(wasmUrl).then((r) => r.arrayBuffer()),
    fetch(modernWasmUrl).then((r) => r.arrayBuffer())
  ]);
  return {
    wasmDataUrl: 'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(wasmData)),
    modernWasmDataUrl:
      'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(modernWasmData))
  };
}

export async function createJassub(
  JASSUBCtor: typeof import('jassub').default,
  params: CreateJassubParams
): Promise<InstanceType<typeof import('jassub').default>> {
  // Wbudowana czcionka awaryjna JASSUB (Liberation Sans). JASSUB wylicza ją wewnętrznie
  // przez `new URL('./default.woff2', import.meta.url)`, co w dev (vite) wskazuje nieistniejący
  // URL, a worker pobiera stronę 404 → libass zgłasza "Error opening memory font" i napisy bez
  // osadzonych czcionek (zwykły `.srt`) nie renderują się. Podajemy ją jawnie przez `?url`, żeby
  // bundler wyemitował poprawny asset, i ustawiamy jako `defaultFont`.
  const availableFonts: Record<string, string> = { ...(params.availableFonts ?? {}) };
  if (!params.defaultFont && !availableFonts['liberation sans']) {
    availableFonts['liberation sans'] = defaultFontUrl;
  }

  const instance = new JASSUBCtor({
    video: params.video,
    subContent: params.subContent,
    workerUrl: params.workerUrlOverride ?? workerUrl,
    wasmUrl: params.wasmUrlOverride ?? wasmUrl,
    modernWasmUrl: params.modernWasmUrlOverride ?? modernWasmUrl,
    timeOffset: params.timeOffset ?? 0,
    // `queryFonts: 'local'` pozwala libass sięgnąć po zainstalowane czcionki (np. Arial).
    queryFonts: params.queryFonts ?? 'local',
    fonts: params.fonts,
    availableFonts,
    defaultFont: params.defaultFont ?? 'liberation sans'
  });
  await instance.ready;
  return instance;
}
