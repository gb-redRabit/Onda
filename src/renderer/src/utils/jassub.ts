import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';

export interface CreateJassubParams {
  video: HTMLVideoElement;
  subContent: string;
  fonts: Uint8Array[];
  availableFonts: Record<string, string>;
  queryFonts?: false | 'local' | 'localandremote';
  defaultFont?: string;
  workerUrlOverride?: string;
  wasmUrlOverride?: string;
  modernWasmUrlOverride?: string;
}

export async function createJassub(
  JASSUBCtor: typeof import('jassub').default,
  params: CreateJassubParams
): Promise<InstanceType<typeof import('jassub').default>> {
  const instance = new JASSUBCtor({
    video: params.video,
    subContent: params.subContent,
    workerUrl: params.workerUrlOverride ?? workerUrl,
    wasmUrl: params.wasmUrlOverride ?? wasmUrl,
    modernWasmUrl: params.modernWasmUrlOverride ?? modernWasmUrl,
    queryFonts: params.queryFonts ?? false,
    fonts: params.fonts,
    availableFonts: params.availableFonts,
    defaultFont: params.defaultFont ?? 'arial'
  });
  await instance.ready;
  return instance;
}