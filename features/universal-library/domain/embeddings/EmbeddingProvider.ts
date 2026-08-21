export interface IEmbeddingProvider {
  /**
   * Generates vector embedding for a single string.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generates vector embeddings for a batch of strings.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Returns the vector dimension length (e.g. 128, 384, 1536).
   */
  readonly dimensions: number;
}
