export interface RetrievalObservabilityMetrics {
  tenantScoped: true;
  strategyUsed: "lexical" | "hybrid";
  lexicalCandidateCount: number;
  semanticCandidateCount: number;
  finalCandidateCount: number;
  cacheHit: boolean;
  rankingSummary: {
    topScore: number;
    matchReasons: string[];
  };
  elapsedMs: number;
}

export class RetrievalObservability {
  private static readonly logs: RetrievalObservabilityMetrics[] = [];

  /**
   * Records lightweight structured metrics.
   * Strictly avoids logging raw payloads, secrets, tenant pricing, or document content.
   */
  public static record(metrics: RetrievalObservabilityMetrics): void {
    const sanitized: RetrievalObservabilityMetrics = {
      tenantScoped: true,
      strategyUsed: metrics.strategyUsed,
      lexicalCandidateCount: metrics.lexicalCandidateCount,
      semanticCandidateCount: metrics.semanticCandidateCount,
      finalCandidateCount: metrics.finalCandidateCount,
      cacheHit: metrics.cacheHit,
      rankingSummary: {
        topScore: metrics.rankingSummary.topScore,
        matchReasons: [...metrics.rankingSummary.matchReasons],
      },
      elapsedMs: metrics.elapsedMs,
    };

    RetrievalObservability.logs.push(sanitized);
    // Keep in-memory buffer bounded
    if (RetrievalObservability.logs.length > 500) {
      RetrievalObservability.logs.shift();
    }
  }

  public static getRecentMetrics(): RetrievalObservabilityMetrics[] {
    return structuredClone(RetrievalObservability.logs);
  }

  public static clear(): void {
    RetrievalObservability.logs.length = 0;
  }
}
