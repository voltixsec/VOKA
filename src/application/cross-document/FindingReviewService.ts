/**
 * Phase 2A-10: the HUMAN review lifecycle of a finding.
 *
 * Two properties are load-bearing and are proven by tests:
 *
 * 1. the comparison engine can never change `reviewState` — it can only change
 *    `reproduced`, `stale`, `staleReason`, and `evidenceChanged`;
 * 2. resolving a finding means the DISCREPANCY REVIEW was closed. It does NOT
 *    mean the quantity was approved. This module imports no requirement, BOM,
 *    quotation, product-selection, or procurement repository, and it writes no
 *    approved quantity, no winning side, and no preferred value.
 *
 * Every transition is an append-only event carrying its actor, reason, and
 * timestamp. Reopening a closed finding is explicit and audited.
 */

import {
  buildReviewEventId,
  isReopen,
  validateReviewTransition,
  type FindingParticipant,
  type FindingReviewEvent,
  type ReviewState,
} from "@/src/domain/cross-document";
import { MAX_REVIEW_EVENTS_RETURNED } from "@/src/domain/cross-document";
import type { CrossDocumentStore } from "./ports";

export type ReviewTransitionCommand = {
  companyId: string;
  findingId: string;
  actorUserId: string;
  toState: ReviewState;
  reason: string;
  at: string;
};

export type ReviewTransitionResult =
  | { ok: true; event: FindingReviewEvent; fromState: ReviewState; toState: ReviewState }
  | { ok: false; problem: string; code: "NOT_FOUND" | "INVALID_TRANSITION" | "REASON_REQUIRED" };

/**
 * Moves a finding through its human lifecycle.
 *
 * The previous state is read from the durable record, the transition is
 * validated against the allowed graph, and the event is appended BEFORE the
 * current state is updated — so a crash can never leave a state change without
 * its audit event.
 */
export async function transitionFindingReview(input: {
  command: ReviewTransitionCommand;
  store: CrossDocumentStore;
}): Promise<ReviewTransitionResult> {
  const { command, store } = input;
  const finding = await store.findFinding({ companyId: command.companyId, findingId: command.findingId });
  if (!finding) return { ok: false, problem: "the finding was not found for the active company", code: "NOT_FOUND" };

  const validation = validateReviewTransition({ from: finding.reviewState, to: command.toState, reason: command.reason });
  if (!validation.valid) {
    const code = (finding.reviewState === "RESOLVED" || finding.reviewState === "DISMISSED") && command.toState === "OPEN" ? "REASON_REQUIRED" : "INVALID_TRANSITION";
    return { ok: false, problem: validation.problem ?? "the transition was refused", code };
  }

  const existingEvents = await store.listReviewEvents({ companyId: command.companyId, findingId: command.findingId, limit: MAX_REVIEW_EVENTS_RETURNED });
  const event: FindingReviewEvent = {
    eventId: buildReviewEventId({ findingId: command.findingId, sequence: existingEvents.length + 1 }),
    findingId: command.findingId,
    companyId: command.companyId,
    fromState: finding.reviewState,
    toState: command.toState,
    kind: isReopen(finding.reviewState, command.toState) ? "REOPENED" : "TRANSITIONED",
    actorUserId: command.actorUserId,
    reason: command.reason,
    explicit: true,
    createdAt: command.at,
  };
  await store.appendReviewEvent(event);
  await store.markFindingReviewState({ companyId: command.companyId, findingId: command.findingId, reviewState: command.toState, updatedAt: command.at });
  return { ok: true, event, fromState: finding.reviewState, toState: command.toState };
}

/**
 * The review resolution contract.
 *
 * This is the entire set of fields a resolution may carry. There is no
 * approved quantity, no approved unit, no winning side, and no correct value —
 * because those are engineering decisions Phase 2A-11 makes separately.
 */
export type FindingResolutionRecord = {
  findingId: string;
  companyId: string;
  reviewState: ReviewState;
  actorUserId: string;
  reason: string;
  closedAt: string | null;
  /** The evidence signature the reviewer closed against. Never a chosen value. */
  evidenceSignatureHash: string;
  /** Explicitly empty by design: this phase has no approved-value concept. */
  approvedQuantity: null;
  approvedUnit: null;
  winningSide: null;
  preferredValue: null;
};

export function toResolutionRecord(input: {
  findingId: string;
  companyId: string;
  reviewState: ReviewState;
  event: FindingReviewEvent | null;
  evidenceSignatureHash: string;
}): FindingResolutionRecord {
  const closed = input.reviewState === "RESOLVED" || input.reviewState === "DISMISSED";
  return {
    findingId: input.findingId,
    companyId: input.companyId,
    reviewState: input.reviewState,
    actorUserId: input.event?.actorUserId ?? "",
    reason: input.event?.reason ?? "",
    closedAt: closed ? (input.event?.createdAt ?? null) : null,
    evidenceSignatureHash: input.evidenceSignatureHash,
    approvedQuantity: null,
    approvedUnit: null,
    winningSide: null,
    preferredValue: null,
  };
}

/** Participants for one finding, in stable display order. Never ranked. */
export async function listFindingParticipants(input: {
  companyId: string;
  findingId: string;
  store: CrossDocumentStore;
}): Promise<FindingParticipant[]> {
  return input.store.listParticipants({ companyId: input.companyId, findingId: input.findingId });
}

/** The complete review history of one finding, oldest first. */
export async function listFindingReviewHistory(input: {
  companyId: string;
  findingId: string;
  store: CrossDocumentStore;
}): Promise<FindingReviewEvent[]> {
  const events = await input.store.listReviewEvents({ companyId: input.companyId, findingId: input.findingId, limit: MAX_REVIEW_EVENTS_RETURNED });
  return [...events].sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0));
}

/** Re-exported so the review surface has one import for its vocabulary. */
export type { ReviewState, FindingReviewEvent };
