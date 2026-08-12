declare module "bidi-js" {
  export interface BidiEmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  export interface BidiApi {
    getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): BidiEmbeddingLevels;
    getReorderedIndices(text: string, levels: BidiEmbeddingLevels, start?: number, end?: number): number[];
  }

  export default function bidiFactory(): BidiApi;
}
