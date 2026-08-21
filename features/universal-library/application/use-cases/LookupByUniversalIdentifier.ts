import type { UniversalIdentifierType } from "@/lib/generated/prisma/client";
import {
  IUniversalLibraryRepository,
  UniversalCatalogItem,
} from "../../domain";

export interface LookupByUniversalIdentifierInput {
  identifierType: UniversalIdentifierType;
  value: string;
  manufacturerId?: string;
  source?: string;
}

export class LookupByUniversalIdentifier {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(
    input: LookupByUniversalIdentifierInput
  ): Promise<UniversalCatalogItem | null> {
    if (!input.value || !input.value.trim()) {
      return null;
    }

    return this.repository.lookupByIdentifier({
      identifierType: input.identifierType,
      value: input.value.trim(),
      ...(input.manufacturerId?.trim()
        ? { manufacturerId: input.manufacturerId.trim() }
        : {}),
      ...(input.source?.trim() ? { source: input.source.trim() } : {}),
    });
  }
}
