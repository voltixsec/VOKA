import type { SourceArtifactContext } from "@/src/domain/source-artifact";

/**
 * Requirement identity scope. Tenant isolation is enforced by the persistence unique key
 * `[companyId, stableKey]`; the stable key itself carries the conversation/runtime (or context)
 * identity plus a structural key, so identical structures in different conversations never collide
 * while repeated edits inside one conversation keep updating the same Requirement.
 */
export type RequirementIdentityScope = {
  context: SourceArtifactContext;
  conversationRuntimeId?: string | null;
};

function segment(value: string) {
  const clean = value.normalize("NFKC").trim();
  if (!clean || /[\s:]/u.test(clean) || clean.length > 128) throw new Error("REQUIREMENT_IDENTITY_SEGMENT_INVALID");
  return clean;
}

/** Deterministic: same scope + same structural key => same stable key. No random identifiers, no free text. */
export function requirementStableKey(scope: RequirementIdentityScope, structuralKey: string) {
  const structure = structuralKey.normalize("NFKC").trim();
  if (!structure || structure.length > 256) throw new Error("REQUIREMENT_STRUCTURAL_KEY_INVALID");
  const owner = scope.conversationRuntimeId?.trim() ? `runtime:${segment(scope.conversationRuntimeId)}` : "runtime:none";
  return `${segment(scope.context)}:${owner}:${structure}`;
}

export function runtimeFactRequirementKey(factKey: string) {
  return `fact:${factKey}`;
}

export function runtimeComponentRequirementKey(systemKey: string, componentId: string) {
  return `component:${systemKey}:${componentId}`;
}

export function artifactBoqRequirementKey(artifactId: string, lineIndex: number) {
  if (!Number.isInteger(lineIndex) || lineIndex <= 0) throw new Error("REQUIREMENT_LINE_INDEX_INVALID");
  return `artifact:${artifactId}:boq:${lineIndex}`;
}
