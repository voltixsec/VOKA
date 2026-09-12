/**
 * Phase 2A-10: COMPARISON SCOPE commands.
 *
 * A scope is durable and explicit: which artifacts participate, which revision
 * policy applies, and which predicates/roles are filtered. Lineage collapse is
 * ALWAYS on and is not configurable. Default comparison never treats a
 * superseded revision as current; historical comparison stays available
 * explicitly through `INCLUDE_SUPERSEDED`.
 *
 * A document role may be user-declared or observed. It may organize, filter,
 * present, and navigate a review. It may NOT select a winner, make a source
 * authoritative, suppress another source, or change a finding's severity.
 */

import { createHash } from "node:crypto";
import {
  CROSS_DOCUMENT_BOUNDS,
  COMPARISON_SCOPE_CLASS,
  DEFAULT_REVISION_POLICY,
  LINEAGE_COLLAPSE_ALWAYS_ON,
  REVISION_POLICIES,
  isDocumentRole,
  type DocumentRole,
  type DocumentRoleSource,
  type RevisionPolicy,
} from "@/src/domain/cross-document";
import type { ComparisonScopeArtifactRecord, ComparisonScopeRecord, CrossDocumentStore } from "./ports";

export type CreateComparisonScopeCommand = {
  companyId: string;
  createdByUserId: string;
  name: string;
  context: string;
  projectKey?: string | null;
  revisionPolicy?: RevisionPolicy;
  predicateFilters?: readonly string[];
  roleFilters?: readonly DocumentRole[];
  artifactIds?: readonly string[];
  createdAt: string;
};

export type ScopeResult =
  | { ok: true; scope: ComparisonScopeRecord; scopeArtifacts: ComparisonScopeArtifactRecord[] }
  | { ok: false; problem: string };

/**
 * Creates a durable comparison scope.
 *
 * Nothing about a scope is inferred: the revision policy defaults to
 * `ACTIVE_ONLY`, and a caller that asks for an unknown policy is refused rather
 * than defaulted silently.
 */
export async function createComparisonScope(input: {
  command: CreateComparisonScopeCommand;
  store: CrossDocumentStore;
}): Promise<ScopeResult> {
  const { command, store } = input;
  const name = command.name.trim();
  if (!name) return { ok: false, problem: "a comparison scope needs a name" };
  const revisionPolicy = command.revisionPolicy ?? DEFAULT_REVISION_POLICY;
  if (!(REVISION_POLICIES as readonly string[]).includes(revisionPolicy)) {
    return { ok: false, problem: "the revision policy is not one this phase implements" };
  }
  const roleFilters: DocumentRole[] = [];
  for (const role of command.roleFilters ?? []) {
    if (!isDocumentRole(role)) return { ok: false, problem: "a role filter is not a document role this phase implements" };
    roleFilters.push(role);
  }

  const comparisonScopeId = `scope_${createHash("sha256")
    .update(["voka:2a-10:scope:v1", command.companyId, name, command.context, command.createdAt].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 40)}`;

  const scope: ComparisonScopeRecord = {
    comparisonScopeId,
    companyId: command.companyId,
    name,
    context: command.context,
    projectKey: command.projectKey ?? null,
    revisionPolicy,
    predicateFilters: [...new Set(command.predicateFilters ?? [])].slice(0, 24),
    roleFilters,
    lineageCollapse: LINEAGE_COLLAPSE_ALWAYS_ON,
    policyBounds: { ...CROSS_DOCUMENT_BOUNDS },
    comparisonScopeClass: COMPARISON_SCOPE_CLASS,
    createdByUserId: command.createdByUserId,
    createdAt: command.createdAt,
    updatedAt: command.createdAt,
  };
  await store.createScope(scope);

  const scopeArtifacts: ComparisonScopeArtifactRecord[] = [];
  for (const artifactId of command.artifactIds ?? []) {
    scopeArtifacts.push(await addScopeArtifact({ companyId: command.companyId, comparisonScopeId, artifactId, store, addedAt: command.createdAt }));
  }
  return { ok: true, scope, scopeArtifacts };
}

/** Adds one artifact to a scope with an observed, unclassified role. */
export async function addScopeArtifact(input: {
  companyId: string;
  comparisonScopeId: string;
  artifactId: string;
  store: CrossDocumentStore;
  addedAt: string;
  documentRole?: DocumentRole;
  documentRoleSource?: DocumentRoleSource;
  declaredByUserId?: string | null;
}): Promise<ComparisonScopeArtifactRecord> {
  return input.store.addScopeArtifact({
    comparisonScopeId: input.comparisonScopeId,
    companyId: input.companyId,
    artifactId: input.artifactId,
    documentRole: input.documentRole ?? "UNKNOWN",
    documentRoleSource: input.documentRoleSource ?? "OBSERVED_FROM_CONTENT",
    roleDeclaredByUserId: input.declaredByUserId ?? null,
    activeRevisionDecisionId: null,
    addedAt: input.addedAt,
  });
}

/**
 * Changes a document role.
 *
 * The role lives on the scope membership only. It never edits a claim, a
 * match, or a finding, which is what makes reordering roles over identical
 * evidence semantically inert.
 */
export async function setDocumentRole(input: {
  companyId: string;
  comparisonScopeId: string;
  artifactId: string;
  documentRole: DocumentRole;
  documentRoleSource: DocumentRoleSource;
  declaredByUserId: string | null;
  store: CrossDocumentStore;
}): Promise<ComparisonScopeArtifactRecord | null> {
  if (!isDocumentRole(input.documentRole)) return null;
  return input.store.updateScopeArtifactRole({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    artifactId: input.artifactId,
    documentRole: input.documentRole,
    documentRoleSource: input.documentRoleSource,
    declaredByUserId: input.declaredByUserId,
  });
}

/** Changes the revision policy. Historical comparison is explicit, never implicit. */
export async function setRevisionPolicy(input: {
  companyId: string;
  comparisonScopeId: string;
  revisionPolicy: RevisionPolicy;
  updatedAt: string;
  store: CrossDocumentStore;
}): Promise<ComparisonScopeRecord | null> {
  if (!(REVISION_POLICIES as readonly string[]).includes(input.revisionPolicy)) return null;
  return input.store.updateScopeRevisionPolicy({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    revisionPolicy: input.revisionPolicy,
    updatedAt: input.updatedAt,
  });
}

/** The predicates a scope compares, derived from its filters and never from wording. */
export function scopePredicateSelection(scope: Pick<ComparisonScopeRecord, "predicateFilters">): readonly string[] {
  return scope.predicateFilters.length ? scope.predicateFilters : ["STATED_QUANTITY"];
}
