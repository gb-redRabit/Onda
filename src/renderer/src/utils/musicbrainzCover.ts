export interface CoverDataResult {
  success: boolean;
  data?: number[];
  mime?: string;
  error?: string;
  rateLimited?: boolean;
}

export function getMusicbrainzCover(id: string): Promise<CoverDataResult | undefined> {
  return (
    window.api as unknown as {
      musicbrainzGetCoverData: (id: string) => Promise<CoverDataResult>;
    }
  )?.musicbrainzGetCoverData(id);
}

export function coverBytesToDataUrl(bytes: number[], mime?: string): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return `data:${mime || 'image/jpeg'};base64,${btoa(binary)}`;
}
