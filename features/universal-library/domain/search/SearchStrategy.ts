export type SearchStrategy = "lexical" | "hybrid";

export interface SearchStrategyOptions {
  strategy?: SearchStrategy;
  enableSemanticFallback?: boolean;
}
