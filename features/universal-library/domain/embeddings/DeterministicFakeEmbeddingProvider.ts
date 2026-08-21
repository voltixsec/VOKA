import { IEmbeddingProvider } from "./EmbeddingProvider";

export class DeterministicFakeEmbeddingProvider implements IEmbeddingProvider {
  public readonly dimensions: number;

  constructor(dimensions: number = 32) {
    this.dimensions = dimensions;
  }

  public async embed(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.generateVector(t));
  }

  private generateVector(text: string): number[] {
    const normalized = (text || "").normalize("NFC").trim().toLowerCase();
    const vector = new Array(this.dimensions).fill(0);

    if (!normalized) {
      return vector;
    }

    // Hash-based deterministic vector generation
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (charCode + i * 31) % this.dimensions;
      vector[idx] += Math.sin(charCode * (i + 1));
    }

    // Normalize vector (L2 norm)
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;

    return vector.map((val) => Number((val / norm).toFixed(6)));
  }
}
