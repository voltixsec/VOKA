import { SystemDiscoverySeed } from "./SystemDiscoverySeed";

export interface DiscoveryQueryOptions {
  prompt: string;
  domainHint?: string | null;
  categoryHint?: string | null;
  targetMarket?: string | null;
  maxComponents?: number;
}

export interface ISystemDiscoveryProvider {
  discoverSystem(options: DiscoveryQueryOptions): Promise<SystemDiscoverySeed>;
}
