import {
  DXF_SEMANTIC_BASELINE_LIMITATION,
  MAX_DXF_LIMITATIONS,
  MAX_DXF_LIMITATIONS_PER_RECORD,
  MAX_RELATIONSHIPS,
  MAX_SEMANTIC_CANDIDATES,
  dxfCandidatesConflict,
  dxfNameTokens,
  formatDxfLayerLocator,
  formatDxfLocator,
  phraseForDxfTokens,
  type DxfAnalysis,
  type DxfEntityEvidence,
  type DxfInspection,
  type DxfRelationship,
  type DxfSemanticCandidate,
  type DxfSemanticSource,
  type ObservationReliability,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-7: bounded relationships and conservative semantic candidates.
 *
 * Two rules shape everything here.
 *
 * First, only relationships the file actually encodes are recorded. An entity
 * names a layer in group 8; an insert names a block in group 2; an attribute
 * hangs off an insert. Those are facts. Connectivity is not: nothing in a DXF
 * says a line feeds a device, that a duct runs somewhere, or that a circuit
 * exists, so CONNECTED_TO, FEEDS, CIRCUIT, PIPE_ROUTE, NETWORK_PATH, AIRFLOW,
 * and CONTROL_LOOP do not exist in this vocabulary and are never inferred from
 * geometry being close together.
 *
 * Second, no candidate is ever promoted to a winner. A block named `SD` on a
 * layer called `FIRE_ALARM` with text "Smoke Detector" nearby supports a
 * reviewable reading, and that is exactly what it stays: observed, not
 * approved, not selected, and not counted. When two readings are supported by
 * the same evidence both survive and the conflict is recorded, because choosing
 * between them would be choosing equipment.
 */

export type DxfStructureLimits = {
  maxRelationships: number;
  maxSemanticCandidates: number;
  /** How far apart, in raw drawing units, "nearby" is allowed to be. */
  nearbyTextRadius: number;
};

export const DEFAULT_DXF_STRUCTURE_LIMITS: DxfStructureLimits = {
  maxRelationships: MAX_RELATIONSHIPS,
  maxSemanticCandidates: MAX_SEMANTIC_CANDIDATES,
  nearbyTextRadius: 250,
};

type RelationshipCollector = {
  relationships: DxfRelationship[];
  truncated: boolean;
  total: number;
};

function pushRelationship(collector: RelationshipCollector, relationship: DxfRelationship, max: number): void {
  collector.total += 1;
  if (collector.relationships.length < max) collector.relationships.push(relationship);
  else collector.truncated = true;
}

/** Entity position used only for proximity, never for measurement. */
function positionOf(entity: DxfEntityEvidence): { x: number; y: number } | null {
  const point = entity.insert?.insertionPoint
    ?? entity.text?.insertionPoint
    ?? entity.geometry.startPoint
    ?? entity.geometry.center;
  if (!point || point.x === null || point.y === null) return null;
  return { x: point.x, y: point.y };
}

/**
 * Raw-coordinate proximity, used only to say which entity a text sits nearest.
 *
 * This deliberately does not produce a length. The comparison is relative and
 * the drawing's units are unknown unless it declared them, so the result is
 * "closest among those inspected" and never "N millimetres away".
 */
function proximityScore(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/**
 * Merges caller-supplied limits over the defaults.
 *
 * A partial object is the normal case, and a defaulted parameter would only
 * apply when the argument is absent — so an empty `{}` would otherwise leave
 * every cap `undefined`, which silently disables bounding rather than applying
 * the production limits. Merging makes the defaults authoritative.
 */
export function resolveDxfStructureLimits(limits: Partial<DxfStructureLimits> = {}): DxfStructureLimits {
  return { ...DEFAULT_DXF_STRUCTURE_LIMITS, ...limits };
}

/** Builds the bounded, evidence-backed relationship set for one inspection. */
export function analyzeDxfRelationships(
  inspection: DxfInspection,
  partialLimits: Partial<DxfStructureLimits> = {},
): { relationships: DxfRelationship[]; count: number; truncated: boolean } {
  const limits = resolveDxfStructureLimits(partialLimits);
  const collector: RelationshipCollector = { relationships: [], truncated: false, total: 0 };

  for (const entity of inspection.entities) {
    if (entity.layerName) {
      pushRelationship(collector, {
        kind: "ENTITY_ON_LAYER",
        subject: entity.locator,
        object: formatDxfLayerLocator(entity.layerName),
        reason: `the entity declares layer '${entity.layerName}' in its own layer group`,
        reliability: "HIGH",
        limitations: ["layer membership is drawing evidence only; the layer name does not determine what the entity is"],
      }, limits.maxRelationships);
    }
    if (entity.blockName) {
      pushRelationship(collector, {
        kind: "ENTITY_IN_BLOCK",
        subject: entity.locator,
        object: formatDxfLocator({ section: "BLOCKS", blockName: entity.blockName }),
        reason: `the entity was read inside the block definition '${entity.blockName}'`,
        reliability: "HIGH",
        limitations: [],
      }, limits.maxRelationships);
    }
    if (entity.insert) {
      pushRelationship(collector, {
        kind: "INSERT_REFERENCES_BLOCK",
        subject: entity.locator,
        object: formatDxfLocator({ section: "BLOCKS", blockName: entity.insert.blockName }),
        reason: entity.insert.blockMissing
          ? `the insert names the block '${entity.insert.blockName}', which the drawing does not define`
          : `the insert names the block '${entity.insert.blockName}'`,
        reliability: entity.insert.blockMissing ? "MEDIUM" : "HIGH",
        limitations: entity.insert.blockMissing
          ? ["the referenced block is undefined in this file, so its contents could not be inspected"]
          : ["the reference is a bounded reference; the block was not exploded into this record"],
      }, limits.maxRelationships);
      for (const attribute of entity.insert.attributes) {
        pushRelationship(collector, {
          kind: "ATTRIBUTE_ON_INSERT",
          subject: attribute.locator,
          object: entity.locator,
          reason: `the attribute '${attribute.tag}' is attached to this insert in the file`,
          reliability: "HIGH",
          limitations: ["an attribute value is an observed CAD literal, not a product specification or a selection"],
        }, limits.maxRelationships);
      }
    }
  }

  for (const block of inspection.blocks) {
    for (const definition of block.attributeDefinitions) {
      pushRelationship(collector, {
        kind: "ATTRIBUTE_DEFINITION_IN_BLOCK",
        subject: definition.locator,
        object: formatDxfLocator({ section: "BLOCKS", blockName: block.name }),
        reason: `the attribute definition '${definition.tag}' belongs to the block '${block.name}'`,
        reliability: "HIGH",
        limitations: ["an attribute definition names a field the block expects; it does not state what was filled in"],
      }, limits.maxRelationships);
    }
  }

  // Text proximity: bounded to the first text records, and stated as "nearest
  // among those inspected" so it can never be read as a measured distance.
  const positioned = inspection.entities
    .map((entity) => ({ entity, point: positionOf(entity) }))
    .filter((entry): entry is { entity: DxfEntityEvidence; point: { x: number; y: number } } => entry.point !== null && !entry.entity.text);
  for (const text of inspection.texts) {
    const textPoint = text.insertionPoint;
    if (!textPoint || textPoint.x === null || textPoint.y === null) continue;
    const origin = { x: textPoint.x, y: textPoint.y };
    let nearest: { entity: DxfEntityEvidence; point: { x: number; y: number } } | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of positioned) {
      const score = proximityScore(origin, candidate.point);
      if (score < best) {
        best = score;
        nearest = candidate;
      }
    }
    if (!nearest || !Number.isFinite(best) || best > limits.nearbyTextRadius) continue;
    pushRelationship(collector, {
      kind: "TEXT_NEAR_ENTITY_CANDIDATE",
      subject: text.locator,
      object: nearest.entity.locator,
      reason: `the text '${text.normalized || text.raw}' sits closest to this entity among those inspected`,
      reliability: "LOW",
      limitations: [
        "proximity in drawing coordinates is a reading hint, not a connection; the distance was not converted and is not stated as a measurement",
      ],
    }, limits.maxRelationships);
  }

  return { relationships: collector.relationships, count: collector.total, truncated: collector.truncated };
}

// ---------------------------------------------------------------------------
// Semantic candidates
// ---------------------------------------------------------------------------

type CandidateDraft = {
  label: string;
  sources: Set<DxfSemanticSource>;
  evidenceLocators: string[];
  reasons: string[];
  limitations: string[];
  space: DxfEntityEvidence["space"];
  reliability: ObservationReliability;
};

function addEvidence(draft: CandidateDraft, source: DxfSemanticSource, locator: string, reason: string): void {
  draft.sources.add(source);
  if (!draft.evidenceLocators.includes(locator)) draft.evidenceLocators.push(locator);
  if (!draft.reasons.includes(reason)) draft.reasons.push(reason);
}

/**
 * Builds conservative semantic candidates from explicit evidence.
 *
 * A candidate needs a phrase VOKA can actually read from the tokens, not a
 * guess. `SD` on `FIRE_ALARM` reads as a smoke detector; `SD` on a layer called
 * `SITE_DRAINAGE` does not, because the layer contradicts the block name and
 * the contradiction is the finding. Candidates are never ranked into a winner
 * and never counted into a quantity.
 */
export function analyzeDxfSemantics(
  inspection: DxfInspection,
  partialLimits: Partial<DxfStructureLimits> = {},
): { candidates: DxfSemanticCandidate[]; truncated: boolean; limitations: string[] } {
  const limits = resolveDxfStructureLimits(partialLimits);
  const drafts = new Map<string, CandidateDraft>();
  const limitations: string[] = [];
  let truncated = false;

  const draftFor = (label: string, space: DxfEntityEvidence["space"]): CandidateDraft => {
    const key = `${label.toUpperCase()}::${space}`;
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        label,
        sources: new Set<DxfSemanticSource>(),
        evidenceLocators: [],
        reasons: [],
        limitations: [DXF_SEMANTIC_BASELINE_LIMITATION],
        space,
        reliability: "LOW",
      };
      drafts.set(key, draft);
    }
    return draft;
  };

  // Layer names. A layer name is semantic evidence about the drawing's own
  // organisation; it never determines what an entity on it is.
  for (const layer of inspection.layers) {
    if (layer.reserved) continue;
    const phrase = phraseForDxfTokens(dxfNameTokens(layer.name));
    if (!phrase) continue;
    const draft = draftFor(phrase, "UNKNOWN_SPACE");
    addEvidence(draft, "LAYER_NAME", layer.locator, `the drawing defines a layer named '${layer.name}'`);
    draft.limitations = [...new Set([...draft.limitations, "a layer name describes how the drawing is organised; entities on it were not classified from the name alone"])];
  }

  // Block names, corroborated by the layers their contents sit on, the
  // attributes attached to their inserts, and text sitting nearby.
  for (const block of inspection.blocks) {
    if (block.spaceOwner || block.anonymous || block.externalReference) continue;
    const blockTokens = dxfNameTokens(block.name);
    const phrase = phraseForDxfTokens(blockTokens);
    const readableLabel = !phrase && blockTokens.length >= 2 ? block.name : phrase;
    if (!readableLabel) continue;

    const inserts = inspection.inserts.filter((insert) => insert.blockName === block.name);
    const space = inserts[0]?.space ?? "UNKNOWN_SPACE";
    const draft = draftFor(readableLabel, space);
    addEvidence(draft, "BLOCK_NAME", formatDxfLocator({ section: "BLOCKS", blockName: block.name }), `the drawing defines a block named '${block.name}'`);

    // Layer corroboration: the layers the block's own entities and its inserts
    // sit on. Used only to confirm a reading, never to override a name.
    const relatedLayers = new Set<string>();
    for (const entityId of block.containedEntityIds) {
      const entity = inspection.entities.find((candidate) => candidate.evidenceId === entityId);
      if (entity?.layerName) relatedLayers.add(entity.layerName);
    }
    for (const insert of inserts) {
      if (insert.layerName) relatedLayers.add(insert.layerName);
    }
    for (const layerName of relatedLayers) {
      const layer = inspection.layers.find((candidate) => candidate.name === layerName);
      if (!layer) continue;
      const layerPhrase = phraseForDxfTokens(dxfNameTokens(layerName));
      if (!layerPhrase) continue;
      addEvidence(draft, "LAYER_NAME", layer.locator, `related content sits on the layer '${layerName}'`);
      // A layer that reads differently from the block name is the finding, not
      // something to reconcile away.
      if (phrase && layerPhrase.toUpperCase() !== phrase.toUpperCase()) {
        draft.limitations = [...new Set([...draft.limitations, `the block name and the layer '${layerName}' suggest different readings; both were kept and neither was preferred`])];
      }
    }

    // Attribute corroboration: values attached to inserts of this block.
    for (const insert of inserts) {
      for (const attribute of insert.attributes) {
        if (!attribute.value.trim()) continue;
        const attributePhrase = phraseForDxfTokens(dxfNameTokens(attribute.value));
        if (!attributePhrase && attribute.value.trim().toUpperCase() !== readableLabel.toUpperCase()) continue;
        addEvidence(draft, "ATTRIBUTE_VALUE", attribute.locator, `an attached attribute '${attribute.tag}' reads '${attribute.value}'`);
      }
    }

    // Nearby-text corroboration, from the proximity relationships already built.
    for (const insert of inserts) {
      const insertPoint = insert.insertionPoint;
      if (!insertPoint || insertPoint.x === null || insertPoint.y === null) continue;
      const origin = { x: insertPoint.x, y: insertPoint.y };
      let nearestText: { text: typeof inspection.texts[number]; score: number } | null = null;
      for (const text of inspection.texts) {
        const point = text.insertionPoint;
        if (!point || point.x === null || point.y === null) continue;
        const score = proximityScore(origin, { x: point.x, y: point.y });
        if (score <= limits.nearbyTextRadius && (!nearestText || score < nearestText.score)) nearestText = { text, score };
      }
      if (!nearestText) continue;
      const label = nearestText.text.normalized || nearestText.text.raw;
      if (!label.trim()) continue;
      addEvidence(draft, "NEARBY_TEXT", nearestText.text.locator, `the text '${label}' sits close to an insert of this block`);
    }

    if (block.attributeDefinitions.length > 0) {
      draft.limitations = [...new Set([...draft.limitations, `the block declares ${block.attributeDefinitions.length} attribute field definition(s); those are field names, not filled-in values`])];
    }
  }

  // Repeated explicit labels: the same phrase written as text more than once is
  // corroborating evidence about the phrase, not a count of anything.
  const labelOccurrences = new Map<string, typeof inspection.texts>();
  for (const text of inspection.texts) {
    const label = (text.normalized || text.raw).trim();
    if (!label || label.length > 80) continue;
    const bucket = labelOccurrences.get(label.toUpperCase());
    if (bucket) bucket.push(text);
    else labelOccurrences.set(label.toUpperCase(), [text]);
  }
  for (const [, occurrences] of labelOccurrences) {
    if (occurrences.length < 2) continue;
    const label = (occurrences[0]!.normalized || occurrences[0]!.raw).trim();
    const draft = draftFor(label, occurrences[0]!.space);
    for (const text of occurrences.slice(0, 4)) {
      addEvidence(draft, "REPEATED_LABEL", text.locator, `the label '${label}' is written in the drawing more than once`);
    }
  }

  const candidates: DxfSemanticCandidate[] = [];
  let index = 0;
  for (const draft of drafts.values()) {
    index += 1;
    // Corroboration is the number of DISTINCT KINDS of evidence, deliberately
    // not the number of instances. Counting instances would turn a review
    // signal into an equipment quantity, which this phase must never produce.
    const corroborationCount = draft.sources.size;
    const reliability: ObservationReliability = corroborationCount >= 3 ? "MEDIUM" : corroborationCount === 2 ? "MEDIUM" : "LOW";
    if (candidates.length < limits.maxSemanticCandidates) {
      candidates.push({
        id: `dxf-s:${index}`,
        label: draft.label,
        sources: [...draft.sources],
        evidenceLocators: draft.evidenceLocators.slice(0, 8),
        reasons: draft.reasons.slice(0, 6),
        corroborationCount,
        confidence: Math.min(0.9, 0.3 + corroborationCount * 0.15),
        reliability,
        status: "OBSERVED_NOT_APPROVED",
        conflictsWith: [],
        space: draft.space,
        limitations: [...new Set(draft.limitations)].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD),
      });
    } else {
      truncated = true;
    }
  }

  // Record conflicts without resolving them.
  for (const left of candidates) {
    for (const right of candidates) {
      if (dxfCandidatesConflict(left, right) && !left.conflictsWith.includes(right.id)) {
        left.conflictsWith.push(right.id);
      }
    }
  }
  for (const candidate of candidates) {
    if (candidate.conflictsWith.length > 0) {
      candidate.limitations = [...new Set([...candidate.limitations, "another reading of the same evidence disagrees; both were kept and VOKA did not choose between them"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
    }
  }

  if (truncated) limitations.push(`more than ${limits.maxSemanticCandidates} semantic candidates were supported; the remainder were not retained`);
  if (candidates.length === 0) {
    limitations.push("no block name, layer name, attribute value, or nearby text supported a semantic reading, so no candidate was proposed");
  }
  return { candidates, truncated, limitations };
}

/**
 * Runs the full structure pass over an inspected drawing.
 *
 * Kept separate from byte parsing so tests can exercise structure against a
 * hand-built inspection, and so the production path can reuse a persisted
 * inspection without re-reading bytes.
 */
export function analyzeDxfStructure(
  inspection: DxfInspection,
  partialLimits: Partial<DxfStructureLimits> = {},
): Pick<DxfAnalysis, "relationships" | "relationshipCount" | "candidates" | "limitations"> & { truncated: boolean } {
  const limits = resolveDxfStructureLimits(partialLimits);
  const relationships = analyzeDxfRelationships(inspection, limits);
  const semantics = analyzeDxfSemantics(inspection, limits);
  const limitations = [...new Set([
    ...inspection.limitations,
    ...semantics.limitations,
    ...(relationships.truncated ? [`more than ${limits.maxRelationships} relationships were supported; the remainder were not retained`] : []),
  ])].slice(0, MAX_DXF_LIMITATIONS);
  return {
    relationships: relationships.relationships,
    relationshipCount: relationships.count,
    candidates: semantics.candidates,
    limitations,
    truncated: relationships.truncated || semantics.truncated,
  };
}
