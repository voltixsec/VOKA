export interface CacheKeyParams {
  companyId: string;
  query?: string;
  type?: string;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  locale?: string;
  limit?: number;
  strategy?: string;
}

export interface IRetrievalCache<T> {
  get(keyParams: CacheKeyParams): Promise<T | null>;
  set(keyParams: CacheKeyParams, value: T, ttlMs?: number): Promise<void>;
  clear(): void;
}

export class BoundedMemoryRetrievalCache<T> implements IRetrievalCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private readonly defaultTtlMs: number;
  private readonly maxCapacity: number;

  constructor(defaultTtlMs: number = 60_000, maxCapacity: number = 1_000) {
    if (!Number.isFinite(defaultTtlMs) || defaultTtlMs <= 0) {
      throw new Error("defaultTtlMs must be a positive finite number.");
    }
    if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) {
      throw new Error("maxCapacity must be a positive integer.");
    }
    this.defaultTtlMs = defaultTtlMs;
    this.maxCapacity = maxCapacity;
  }

  public generateKey(p: CacheKeyParams): string {
    const q = (p.query || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    const type = p.type || "";
    const cat = p.categoryId || "";
    const mfg = p.manufacturerId || "";
    const brand = p.brandId || "";
    const loc = p.locale || "";
    const lim = p.limit ?? 20;
    const strat = p.strategy || "hybrid";

    // JSON tuple encoding prevents delimiter collisions while retaining tenant identity.
    return JSON.stringify([p.companyId.trim(), q, type, cat, mfg, brand, loc, lim, strat]);
  }

  public async get(keyParams: CacheKeyParams): Promise<T | null> {
    try {
      const key = this.generateKey(keyParams);
      const entry = this.store.get(key);
      if (!entry) return null;

      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return null;
      }

      return structuredClone(entry.value);
    } catch {
      // Cache failure must never break retrieval
      return null;
    }
  }

  public async set(keyParams: CacheKeyParams, value: T, ttlMs?: number): Promise<void> {
    try {
      const key = this.generateKey(keyParams);
      const requestedTtl = ttlMs ?? this.defaultTtlMs;
      const ttl = Math.min(Math.max(requestedTtl, 1), this.defaultTtlMs);
      if (!Number.isFinite(requestedTtl)) return;
      const expiresAt = Date.now() + ttl;

      // Evict oldest entries if capacity exceeded
      if (this.store.size >= this.maxCapacity && !this.store.has(key)) {
        const firstKey = this.store.keys().next().value;
        if (firstKey) {
          this.store.delete(firstKey);
        }
      }

      this.store.set(key, { value: structuredClone(value), expiresAt });
    } catch {
      // Ignore cache write errors safely
    }
  }

  public clear(): void {
    this.store.clear();
  }

  public get size(): number {
    return this.store.size;
  }
}
