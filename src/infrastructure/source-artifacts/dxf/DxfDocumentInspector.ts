import {
  DXF_BASELINE_LIMITATION,
  DXF_NO_COUNT_LIMITATION,
  DXF_PAGE_NUMBER,
  MAX_ATTRIBUTES_PER_RECORD,
  MAX_BLOCKS,
  MAX_DXF_BYTES,
  MAX_DXF_LIMITATIONS,
  MAX_DXF_LIMITATIONS_PER_RECORD,
  MAX_DXF_TEXT_CHARACTERS,
  MAX_DIMENSION_RECORDS,
  MAX_ENTITIES,
  MAX_ENTITIES_PER_BLOCK,
  MAX_EXTERNAL_REFERENCES,
  MAX_GROUP_CODES_SCANNED,
  MAX_HEADER_VARIABLES,
  MAX_LAYERS,
  MAX_RETAINED_ENTITIES,
  MAX_TEXT_RECORDS,
  MAX_VERTICES_PER_ENTITY,
  dxfLayerStateFromFlags,
  dxfUnitsFromCode,
  dxfVersionFromCode,
  formatDxfLocator,
  formatDxfLayerLocator,
  isReservedDxfLayer,
  type DxfAttributeEvidence,
  type DxfBlockDefinition,
  type DxfBlockInsert,
  type DxfDimensionEvidence,
  type DxfDocumentFacts,
  type DxfEntityEvidence,
  type DxfExternalReference,
  type DxfInspection,
  type DxfLayerEvidence,
  type DxfPoint,
  type DxfSpace,
  type DxfSpaceAttribution,
  type DxfSpaceSummary,
  type DxfTextEvidence,
} from "@/src/domain/source-artifact";
import { DxfGroupCodeCursor, numericGroupValue, type DxfGroupCode } from "./DxfGroupCodes";
import { DxfInspectionError, detectDxfFormat, type DxfFormatDecision } from "./DxfFormat";
import { attachPolylineVertices, buildEntityEvidence, ownsTrailingSequence, type RawDxfEntity } from "./DxfEntityAnalyzer";

/**
 * Phase 2A-7: bounded ASCII DXF document inspector.
 *
 * This is the only place in VOKA where drawing bytes are read. It owns the
 * group-code walk and produces the domain evidence model; nothing outside this
 * folder ever sees a group code, a raw section, or a parser object.
 *
 * Hard rules:
 * - a handle is never invented. When the file omitted one, the record says so
 *   and carries a positional reference instead, because a fabricated handle
 *   resolves to a different entity in the real drawing;
 * - blocks are never exploded. A block definition records the handles of the
 *   entities it contains and an insert records the name it references; the link
 *   is a reference, never a copy, and a cycle cannot expand because nothing is
 *   expanded at all;
 * - an external reference path is recorded and never opened, fetched, or
 *   resolved. Reading a local path from a drawing would be reading the
 *   author's filesystem; fetching a network path would be VOKA making a
 *   request the user never authorised;
 * - every collection is bounded by the limits below. Crossing a cap truncates
 *   deterministically, keeps the true total in a counter, and records a
 *   limitation, so a hostile or merely huge drawing cannot expand memory
 *   without limit and no significant evidence is silently dropped.
 */

export type DxfInspectionLimits = {
  maxBytes: number;
  maxEntities: number;
  maxLayers: number;
  maxBlocks: number;
  maxEntitiesPerBlock: number;
  maxVerticesPerEntity: number;
  maxTextRecords: number;
  maxDimensionRecords: number;
  maxAttributesPerRecord: number;
  maxExternalReferences: number;
  maxRetainedEntities: number;
  maxHeaderVariables: number;
  maxGroupCodesScanned: number;
};

export const DEFAULT_DXF_LIMITS: DxfInspectionLimits = {
  maxBytes: MAX_DXF_BYTES,
  maxEntities: MAX_ENTITIES,
  maxLayers: MAX_LAYERS,
  maxBlocks: MAX_BLOCKS,
  maxEntitiesPerBlock: MAX_ENTITIES_PER_BLOCK,
  maxVerticesPerEntity: MAX_VERTICES_PER_ENTITY,
  maxTextRecords: MAX_TEXT_RECORDS,
  maxDimensionRecords: MAX_DIMENSION_RECORDS,
  maxAttributesPerRecord: MAX_ATTRIBUTES_PER_RECORD,
  maxExternalReferences: MAX_EXTERNAL_REFERENCES,
  maxRetainedEntities: MAX_RETAINED_ENTITIES,
  maxHeaderVariables: MAX_HEADER_VARIABLES,
  maxGroupCodesScanned: MAX_GROUP_CODES_SCANNED,
};

/** Reserved AutoCAD block names that own a space rather than defining geometry. */
const MODEL_SPACE_BLOCK = "*MODEL_SPACE";
const PAPER_SPACE_BLOCK_PREFIX = "*PAPER_SPACE";

type BlockRecordRow = { handle: string; name: string };

type SpaceResolution = {
  space: DxfSpace;
  spaceAttribution: DxfSpaceAttribution;
  layoutName: string | null;
};

function emptySpaceSummary(space: DxfSpace, maxRetained: number): DxfSpaceSummary & { maxRetained: number } {
  return {
    space,
    layoutName: null,
    entities: [],
    entityCount: 0,
    layerNames: [],
    insertedBlockNames: [],
    textCount: 0,
    dimensionCount: 0,
    insertCount: 0,
    truncated: false,
    locator: space === "PAPER_SPACE" ? "DXF:PAPER_SPACE" : space === "MODEL_SPACE" ? "DXF:MODEL_SPACE" : "DXF:UNATTRIBUTED_SPACE",
    limitations: [],
    maxRetained,
  };
}

/**
 * Decodes drawing bytes to text.
 *
 * DXF files are written in the code page named by `$DWGCODEPAGE`, but that
 * variable is inside the file, so it cannot be known before decoding. UTF-8 is
 * tried first because it is strict about malformed sequences; when it fails,
 * latin1 is used, which maps every byte and therefore never throws. Either way
 * the code page is reported as metadata rather than being silently assumed.
 */
export function decodeDxfText(bytes: Uint8Array): { text: string; usedFallback: boolean } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), usedFallback: false };
  } catch {
    return { text: new TextDecoder("latin1").decode(bytes), usedFallback: true };
  }
}

type InspectorState = {
  limits: DxfInspectionLimits;
  layers: Map<string, DxfLayerEvidence>;
  blocks: Map<string, DxfBlockDefinition>;
  /** BLOCK_RECORD rows, keyed by handle: the bridge from owner handles to spaces. */
  blockRecords: Map<string, BlockRecordRow>;
  /** Paper-space BLOCK_RECORD handle -> layout name, from the LAYOUT objects. */
  layouts: Map<string, string>;
  headerVariables: Array<{ name: string; raw: string; locator: string }>;
  headerRaw: Map<string, Array<{ code: number; value: string }>>;
  sectionsPresent: string[];
  entities: DxfEntityEvidence[];
  inserts: DxfBlockInsert[];
  texts: DxfTextEvidence[];
  dimensions: DxfDimensionEvidence[];
  attributes: DxfAttributeEvidence[];
  externalReferences: DxfExternalReference[];
  spaces: Record<DxfSpace, DxfSpaceSummary & { maxRetained: number }>;
  entityTypeCounts: Record<string, number>;
  unmodelled: Set<string>;
  limitations: string[];
  counters: {
    entitiesRead: number;
    entitiesRetained: number;
    layersTruncated: boolean;
    blocksTruncated: boolean;
    entitiesTruncated: boolean;
    textsTruncated: boolean;
    dimensionsTruncated: boolean;
    externalReferencesTruncated: boolean;
    headerVariablesTruncated: boolean;
  };
  position: number;
};

function newState(limits: DxfInspectionLimits): InspectorState {
  return {
    limits,
    layers: new Map(),
    blocks: new Map(),
    blockRecords: new Map(),
    layouts: new Map(),
    headerVariables: [],
    headerRaw: new Map(),
    sectionsPresent: [],
    entities: [],
    inserts: [],
    texts: [],
    dimensions: [],
    attributes: [],
    externalReferences: [],
    spaces: {
      MODEL_SPACE: emptySpaceSummary("MODEL_SPACE", limits.maxRetainedEntities),
      PAPER_SPACE: emptySpaceSummary("PAPER_SPACE", limits.maxRetainedEntities),
      UNKNOWN_SPACE: emptySpaceSummary("UNKNOWN_SPACE", limits.maxRetainedEntities),
    },
    entityTypeCounts: {},
    unmodelled: new Set(),
    limitations: [],
    counters: {
      entitiesRead: 0,
      entitiesRetained: 0,
      layersTruncated: false,
      blocksTruncated: false,
      entitiesTruncated: false,
      textsTruncated: false,
      dimensionsTruncated: false,
      externalReferencesTruncated: false,
      headerVariablesTruncated: false,
    },
    position: 0,
  };
}

function addLimitation(state: InspectorState, limitation: string): void {
  if (!state.limitations.includes(limitation)) state.limitations.push(limitation);
}

function valueOf(groups: DxfGroupCode[], code: number): string | null {
  const found = groups.find((group) => group.code === code);
  return found ? found.value : null;
}

function numberOf(groups: DxfGroupCode[], code: number): number | null {
  const found = groups.find((group) => group.code === code);
  return found ? numericGroupValue(found.code, found.value) : null;
}

// ---------------------------------------------------------------------------
// Space resolution
// ---------------------------------------------------------------------------

function modelSpaceRecordHandle(state: InspectorState): string | null {
  for (const [handle, record] of state.blockRecords) {
    if (record.name.toUpperCase() === MODEL_SPACE_BLOCK) return handle;
  }
  return null;
}

function paperSpaceRecordHandles(state: InspectorState): Set<string> {
  const handles = new Set<string>();
  for (const [handle, record] of state.blockRecords) {
    if (record.name.toUpperCase().startsWith(PAPER_SPACE_BLOCK_PREFIX)) handles.add(handle);
  }
  return handles;
}

/**
 * Establishes which space an entity belongs to, and how that was known.
 *
 * The order is evidence first, convention last: an explicit group-67 flag wins,
 * then the owner-handle chain into a space-owning BLOCK_RECORD, then the space
 * of a containing block, and only then the DXF convention that the ENTITIES
 * section holds model-space content. Each route is recorded, so a reviewer can
 * tell a proven space from an assumed one instead of trusting a merge that was
 * never justified.
 */
function resolveSpace(
  groups: DxfGroupCode[],
  state: InspectorState,
  containingBlock: DxfBlockDefinition | null,
): SpaceResolution {
  const paperFlag = numberOf(groups, 67);
  const ownerHandle = valueOf(groups, 330);

  // The entity's own group-67 flag comes first. It is a statement about this
  // entity, which is more specific than the space of a block it happens to sit
  // inside, so it is checked before the containing block is consulted.
  if (paperFlag !== null) {
    if (paperFlag !== 0) {
      const layout = containingBlock?.layoutName ?? (ownerHandle ? state.layouts.get(ownerHandle) ?? null : null);
      return { space: "PAPER_SPACE", spaceAttribution: "GROUP_67", layoutName: layout };
    }
    return { space: "MODEL_SPACE", spaceAttribution: "GROUP_67", layoutName: null };
  }

  if (containingBlock) {
    if (containingBlock.space !== "UNKNOWN_SPACE") {
      return { space: containingBlock.space, spaceAttribution: "BLOCK_OWNER", layoutName: containingBlock.layoutName };
    }
    return { space: "UNKNOWN_SPACE", spaceAttribution: "UNRESOLVED", layoutName: null };
  }

  if (ownerHandle) {
    if (paperSpaceRecordHandles(state).has(ownerHandle)) {
      return { space: "PAPER_SPACE", spaceAttribution: "OWNER_HANDLE", layoutName: state.layouts.get(ownerHandle) ?? null };
    }
    const modelHandle = modelSpaceRecordHandle(state);
    if (modelHandle && ownerHandle === modelHandle) {
      return { space: "MODEL_SPACE", spaceAttribution: "OWNER_HANDLE", layoutName: null };
    }
  }

  // The DXF convention: content in the ENTITIES section is model space, and
  // paper-space content lives in a *Paper_Space block. Recorded as a convention
  // rather than a proof so the assumption stays visible.
  return { space: "MODEL_SPACE", spaceAttribution: "SECTION_CONVENTION", layoutName: null };
}

// ---------------------------------------------------------------------------
// Section walkers
// ---------------------------------------------------------------------------

/** Reads the HEADER section into a bounded variable map. */
function readHeaderSection(cursor: DxfGroupCodeCursor, state: InspectorState): void {
  let current: string | null = null;
  for (;;) {
    const group = cursor.peek();
    if (!group) return;
    if (group.code === 0) {
      if (group.value.toUpperCase() === "ENDSEC") { cursor.next(); return; }
      return;
    }
    const read = cursor.next();
    if (!read) return;
    if (read.code === 9) {
      current = read.value;
      if (!state.headerRaw.has(current)) {
        if (state.headerRaw.size >= state.limits.maxHeaderVariables) {
          state.counters.headerVariablesTruncated = true;
          current = null;
        } else {
          state.headerRaw.set(current, []);
        }
      }
      continue;
    }
    if (current) state.headerRaw.get(current)?.push({ code: read.code, value: read.value });
  }
}

/** Reads one LAYER record from the LAYER table. */
function readLayerRecord(groups: DxfGroupCode[], state: InspectorState): void {
  const name = valueOf(groups, 2);
  if (!name) return;
  if (state.layers.size >= state.limits.maxLayers) {
    state.counters.layersTruncated = true;
    return;
  }
  const flags = numberOf(groups, 70);
  const colorValue = numberOf(groups, 62);
  const derived = dxfLayerStateFromFlags(flags, colorValue);
  const handle = valueOf(groups, 5);
  const limitations: string[] = [];
  if (!handle) limitations.push("the layer record carried no handle, so it is cited by name only");
  if (derived.off) limitations.push("the layer is switched off in the drawing, so its content is hidden evidence");
  if (derived.frozen) limitations.push("the layer is frozen, so its content is hidden evidence");
  if (derived.locked) limitations.push("the layer is locked in the drawing");
  if (isReservedDxfLayer(name)) limitations.push("this is a reserved AutoCAD layer whose name carries no design meaning");
  state.layers.set(name, {
    name,
    handle,
    ownerHandle: valueOf(groups, 330),
    colorIndex: derived.colorIndex,
    off: derived.off,
    lineType: valueOf(groups, 6),
    frozen: derived.frozen,
    frozenByDefault: derived.frozenByDefault,
    locked: derived.locked,
    flags,
    reserved: isReservedDxfLayer(name),
    observedEntityCount: 0,
    locator: formatDxfLayerLocator(name),
    reliability: handle ? "HIGH" : "MEDIUM",
    limitations: [...new Set(limitations)].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD),
  });
}

/** Reads the TABLES section: layers, block records, and line types. */
function readTablesSection(cursor: DxfGroupCodeCursor, state: InspectorState): void {
  for (;;) {
    const group = cursor.peek();
    if (!group) return;
    if (group.code === 0 && group.value.toUpperCase() === "ENDSEC") { cursor.next(); return; }
    if (group.code !== 0 || group.value.toUpperCase() !== "TABLE") { cursor.next(); continue; }
    cursor.next(); // consume 0/TABLE
    const nameGroup = cursor.peek();
    const tableName = nameGroup && nameGroup.code === 2 ? cursor.next()!.value.toUpperCase() : "";
    // Read every record in the table, then consume its ENDTAB.
    const records: DxfGroupCode[][] = [];
    let current: DxfGroupCode[] | null = null;
    for (;;) {
      const inner = cursor.peek();
      if (!inner) break;
      if (inner.code === 0) {
        if (inner.value.toUpperCase() === "ENDTAB") { cursor.next(); break; }
        if (inner.value.toUpperCase() === "ENDSEC") break;
        if (current) records.push(current);
        current = [];
        cursor.next();
        continue;
      }
      const read = cursor.next();
      if (!read) break;
      if (!current) current = [];
      current.push(read);
    }
    if (current && current.length) records.push(current);
    if (tableName === "LAYER") {
      for (const record of records) readLayerRecord(record, state);
    } else if (tableName === "BLOCK_RECORD") {
      for (const record of records) {
        const handle = valueOf(record, 5);
        const name = valueOf(record, 2);
        if (handle && name) state.blockRecords.set(handle, { handle, name });
      }
    }
  }
}

/** Reads the OBJECTS section for LAYOUT records, which name the paper spaces. */
function readObjectsSection(cursor: DxfGroupCodeCursor, state: InspectorState): void {
  for (;;) {
    const group = cursor.peek();
    if (!group) return;
    if (group.code === 0 && group.value.toUpperCase() === "ENDSEC") { cursor.next(); return; }
    if (group.code !== 0) { cursor.next(); continue; }
    const objectType = cursor.next()!.value.toUpperCase();
    const body = cursor.readEntityBody();
    if (objectType !== "LAYOUT") continue;
    // A LAYOUT carries two 330 groups: the owner dictionary first, then — after
    // the AcDbLayout subclass marker — the paper-space BLOCK_RECORD it presents.
    // Only the second identifies the space, so the marker is what disambiguates.
    let inLayoutSubclass = false;
    let layoutName: string | null = null;
    let blockRecordHandle: string | null = null;
    for (const entry of body) {
      if (entry.code === 100) {
        inLayoutSubclass = entry.value === "AcDbLayout";
        continue;
      }
      if (!inLayoutSubclass) continue;
      if (entry.code === 1 && layoutName === null) layoutName = entry.value;
      if (entry.code === 330) blockRecordHandle = entry.value;
    }
    if (layoutName && blockRecordHandle) state.layouts.set(blockRecordHandle, layoutName);
  }
}

/** Reads one raw entity: the group codes between this `0` pair and the next. */
function readRawEntity(cursor: DxfGroupCodeCursor): RawDxfEntity | null {
  const marker = cursor.next();
  if (!marker || marker.code !== 0) return null;
  return { type: marker.value, groups: cursor.readEntityBody() };
}

/**
 * Reads the dependent sequence that follows a POLYLINE or INSERT.
 *
 * Returns the collected bodies and whether the sequence was cut short. Stopping
 * at `SEQEND` is what the format prescribes; the cap protects against a file
 * that never terminates the sequence, which would otherwise make the reader
 * consume the rest of the drawing as vertices or attributes.
 */
function readTrailingSequence(
  cursor: DxfGroupCodeCursor,
  expected: "VERTEX" | "ATTRIB",
  maxRecords: number,
): { bodies: RawDxfEntity[]; total: number; truncated: boolean } {
  const bodies: RawDxfEntity[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const upcoming = cursor.peek();
    if (!upcoming || upcoming.code !== 0) return { bodies, total, truncated };
    const name = upcoming.value.toUpperCase();
    if (name === "SEQEND") {
      cursor.next();
      cursor.readEntityBody();
      return { bodies, total, truncated };
    }
    if (name !== expected) return { bodies, total, truncated };
    const raw = readRawEntity(cursor);
    if (!raw) return { bodies, total, truncated };
    total += 1;
    if (bodies.length < maxRecords) bodies.push(raw);
    else truncated = true;
  }
}

/** Records one finished entity into every collection that needs it. */
function recordEntity(state: InspectorState, entity: DxfEntityEvidence): void {
  state.counters.entitiesRead += 1;
  state.entityTypeCounts[entity.entityType] = (state.entityTypeCounts[entity.entityType] ?? 0) + 1;
  if (entity.knownType === "OTHER") state.unmodelled.add(entity.entityType);

  const summary = state.spaces[entity.space]!;
  summary.entityCount += 1;
  if (entity.layerName && !summary.layerNames.includes(entity.layerName)) summary.layerNames.push(entity.layerName);
  if (entity.insert?.blockName && !summary.insertedBlockNames.includes(entity.insert.blockName)) summary.insertedBlockNames.push(entity.insert.blockName);
  if (entity.text) summary.textCount += 1;
  if (entity.dimension) summary.dimensionCount += 1;
  if (entity.insert) summary.insertCount += 1;

  if (entity.layerName) {
    const layer = state.layers.get(entity.layerName);
    if (layer) layer.observedEntityCount += 1;
  }

  if (entity.text && state.texts.length < state.limits.maxTextRecords) state.texts.push(entity.text);
  else if (entity.text) state.counters.textsTruncated = true;
  if (entity.dimension && state.dimensions.length < state.limits.maxDimensionRecords) state.dimensions.push(entity.dimension);
  else if (entity.dimension) state.counters.dimensionsTruncated = true;
  if (entity.insert) state.inserts.push(entity.insert);
  if (entity.attribute) state.attributes.push(entity.attribute);

  if (state.entities.length < state.limits.maxRetainedEntities) {
    state.entities.push(entity);
    state.counters.entitiesRetained += 1;
  } else {
    state.counters.entitiesTruncated = true;
  }
  if (summary.entities.length < summary.maxRetained) summary.entities.push(entity);
  else summary.truncated = true;

  if (state.counters.entitiesRead > state.limits.maxEntities) {
    state.counters.entitiesTruncated = true;
    throw new EntityLimitReached();
  }
}

/** Internal signal that the entity cap was hit, so the walk can stop cleanly. */
class EntityLimitReached extends Error {
  constructor() {
    super("DXF_ENTITY_LIMIT_REACHED");
    this.name = "EntityLimitReached";
  }
}

/** Reads a BLOCK definition, including the entities it contains. */
function readBlockDefinition(cursor: DxfGroupCodeCursor, state: InspectorState): void {
  const header = cursor.readEntityBody();
  const name = valueOf(header, 2) ?? "";
  if (!name) {
    addLimitation(state, "a BLOCK record carried no name, so its contents could not be attributed");
    cursor.readUntil((group) => group.code === 0 && group.value.toUpperCase() === "ENDBLK");
    const endblk = cursor.peek();
    if (endblk && endblk.code === 0 && endblk.value.toUpperCase() === "ENDBLK") { cursor.next(); cursor.readEntityBody(); }
    return;
  }
  if (state.blocks.size >= state.limits.maxBlocks) {
    state.counters.blocksTruncated = true;
    cursor.readUntil((group) => group.code === 0 && group.value.toUpperCase() === "ENDBLK");
    const endblk = cursor.peek();
    if (endblk && endblk.code === 0 && endblk.value.toUpperCase() === "ENDBLK") { cursor.next(); cursor.readEntityBody(); }
    return;
  }

  const handle = valueOf(header, 5);
  const flags = numberOf(header, 70) ?? 0;
  const xrefPath = valueOf(header, 1);
  const upperName = name.toUpperCase();
  const spaceOwner = upperName === MODEL_SPACE_BLOCK || upperName.startsWith(PAPER_SPACE_BLOCK_PREFIX);
  const paperFlag = numberOf(header, 67);
  const record = handle ? state.blockRecords.get(handle) : null;
  const layoutName = spaceOwner && handle ? state.layouts.get(handle) ?? null : null;
  const space: DxfSpace = upperName === MODEL_SPACE_BLOCK
    ? "MODEL_SPACE"
    : spaceOwner || paperFlag === 1
      ? "PAPER_SPACE"
      : "UNKNOWN_SPACE";

  const definition: DxfBlockDefinition = {
    name,
    handle,
    ownerHandle: valueOf(header, 330),
    layerName: valueOf(header, 8),
    basePoint: (() => {
      const x = numberOf(header, 10);
      if (x === null) return null;
      return { x, y: numberOf(header, 20), z: numberOf(header, 30) } satisfies DxfPoint;
    })(),
    flags,
    anonymous: (flags & 0x01) !== 0,
    externalReference: (flags & 0x04) !== 0,
    xrefOverlay: (flags & 0x08) !== 0,
    xrefPath: xrefPath && xrefPath.trim() ? xrefPath : null,
    spaceOwner,
    space,
    layoutName,
    containedEntityIds: [],
    containedEntityCount: 0,
    attributeDefinitions: [],
    insertHandles: [],
    insertCount: 0,
    containedTruncated: false,
    locator: formatDxfLocator({ section: "BLOCKS", blockName: name, entityHandle: handle }),
    reliability: handle ? "HIGH" : "MEDIUM",
    limitations: [],
  };

  const limitations: string[] = [];
  if (!handle) limitations.push("the block definition carried no handle");
  if (definition.anonymous) limitations.push("this is an anonymous block, typically the private geometry of a dimension");
  if (definition.externalReference) {
    limitations.push("this block is an external reference; the referenced file was not opened, fetched, or resolved");
    if (definition.xrefPath && state.externalReferences.length < state.limits.maxExternalReferences) {
      state.externalReferences.push({
        blockName: name,
        path: definition.xrefPath,
        looksRemote: /^[a-z]+:\/\//iu.test(definition.xrefPath) || definition.xrefPath.startsWith("\\\\"),
        overlay: definition.xrefOverlay,
        handle,
        locator: formatDxfLocator({ section: "BLOCKS", blockName: name, entityHandle: handle }),
        limitations: ["the referenced file was not opened, fetched, or resolved; only this metadata was recorded"],
      });
    } else if (definition.xrefPath) {
      state.counters.externalReferencesTruncated = true;
    }
  }
  if (record && record.name.toUpperCase() !== upperName) {
    limitations.push(`the block name and its BLOCK_RECORD entry differ ('${record.name}'); both were preserved`);
  }

  // Read the block's entities. They are referenced by id, never copied, so a
  // block inserted a thousand times does not duplicate a thousand geometries.
  try {
    for (;;) {
      const upcoming = cursor.peek();
      if (!upcoming) break;
      if (upcoming.code === 0 && upcoming.value.toUpperCase() === "ENDBLK") {
        cursor.next();
        cursor.readEntityBody();
        break;
      }
      if (upcoming.code !== 0) { cursor.next(); continue; }
      const raw = readRawEntity(cursor);
      if (!raw) break;
      const contained = readEntityFromRaw(state, raw, cursor, definition);
      if (!contained) continue;
      definition.containedEntityCount += 1;
      if (definition.containedEntityIds.length < state.limits.maxEntitiesPerBlock) {
        definition.containedEntityIds.push(contained.evidenceId);
      } else {
        definition.containedTruncated = true;
      }
      if (contained.attribute?.entityType === "ATTDEF" && definition.attributeDefinitions.length < state.limits.maxAttributesPerRecord) {
        definition.attributeDefinitions.push(contained.attribute);
      }
    }
  } catch (error) {
    if (error instanceof EntityLimitReached) state.counters.entitiesTruncated = true;
    else throw error;
  }
  if (definition.containedTruncated) {
    limitations.push(`only the first ${definition.containedEntityIds.length} of ${definition.containedEntityCount} contained entities were retained`);
  }
  definition.limitations = [...new Set(limitations)].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
  state.blocks.set(name, definition);
}

/**
 * Builds one entity from its raw codes, consuming any dependent sequence.
 *
 * Returns null for the dependent records themselves (VERTEX, ATTRIB, SEQEND),
 * which are folded into their owner rather than recorded as standalone
 * entities. An ATTRIB kept on its own would lose the insert it belongs to, and
 * the insert is the only evidence of which device the attribute describes.
 */
function readEntityFromRaw(
  state: InspectorState,
  raw: RawDxfEntity,
  cursor: DxfGroupCodeCursor,
  containingBlock: DxfBlockDefinition | null,
): DxfEntityEvidence | null {
  const upper = raw.type.toUpperCase();
  if (upper === "VERTEX" || upper === "ATTRIB" || upper === "SEQEND") return null;
  if (state.counters.entitiesRead >= state.limits.maxEntities) {
    state.counters.entitiesTruncated = true;
    throw new EntityLimitReached();
  }

  state.position += 1;
  const resolution = resolveSpace(raw.groups, state, containingBlock);
  const context = {
    artifactId: "",
    blockName: containingBlock?.name ?? null,
    space: resolution.space,
    spaceAttribution: resolution.spaceAttribution,
    layoutName: resolution.layoutName,
    position: state.position,
    maxVerticesPerEntity: state.limits.maxVerticesPerEntity,
    maxTextCharacters: MAX_DXF_TEXT_CHARACTERS,
    maxAttributesPerRecord: state.limits.maxAttributesPerRecord,
  };

  const entity = buildEntityEvidence(raw, context);
  if (resolution.spaceAttribution === "SECTION_CONVENTION") {
    entity.limitations = [...new Set([...entity.limitations, "the space was taken from the DXF convention that the ENTITIES section holds model space; the entity carried no explicit space flag"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
  }

  const trailing = ownsTrailingSequence(raw.type);
  if (trailing === "VERTEX") {
    const sequence = readTrailingSequence(cursor, "VERTEX", state.limits.maxVerticesPerEntity);
    const points: DxfPoint[] = sequence.bodies.map((body) => ({
      x: numberOf(body.groups, 10),
      y: numberOf(body.groups, 20),
      z: numberOf(body.groups, 30),
    }));
    attachPolylineVertices(entity.geometry, points, state.limits.maxVerticesPerEntity, sequence.total);
    if (sequence.truncated) {
      entity.geometry.limitations = [...new Set([...entity.geometry.limitations, "the polyline's vertex sequence exceeded the retention limit and was truncated"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
    }
    // Each VERTEX is a real entity in the file and is counted, but it is not
    // recorded separately: it is part of its polyline.
    state.counters.entitiesRead += sequence.total;
    state.entityTypeCounts.VERTEX = (state.entityTypeCounts.VERTEX ?? 0) + sequence.total;
  } else if (trailing === "ATTRIB") {
    const sequence = readTrailingSequence(cursor, "ATTRIB", state.limits.maxAttributesPerRecord);
    const attributes = sequence.bodies
      .map((body) => buildEntityEvidence(body, context))
      .map((built) => built.attribute)
      .filter((attribute): attribute is DxfAttributeEvidence => attribute !== null)
      .map((attribute) => ({ ...attribute, insertHandle: entity.handle, blockName: entity.insert?.blockName ?? null }));
    state.counters.entitiesRead += sequence.total;
    state.entityTypeCounts.ATTRIB = (state.entityTypeCounts.ATTRIB ?? 0) + sequence.total;
    if (entity.insert) {
      entity.insert = {
        ...entity.insert,
        attributes,
        attributeCount: sequence.total,
        attributesTruncated: sequence.truncated || sequence.total > attributes.length,
      };
      if (sequence.truncated) {
        entity.insert.limitations = [...new Set([...entity.insert.limitations, `only the first ${attributes.length} of ${sequence.total} attributes on this insert were retained`])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
      }
    }
    for (const attribute of attributes) state.attributes.push(attribute);
  }

  recordEntity(state, entity);
  return entity;
}

/** Reads the ENTITIES or a BLOCKS section body. */
function readEntitySection(cursor: DxfGroupCodeCursor, state: InspectorState, mode: "ENTITIES" | "BLOCKS"): void {
  try {
    for (;;) {
      const upcoming = cursor.peek();
      if (!upcoming) return;
      if (upcoming.code === 0 && upcoming.value.toUpperCase() === "ENDSEC") { cursor.next(); return; }
      if (upcoming.code !== 0) { cursor.next(); continue; }
      if (mode === "BLOCKS" && upcoming.value.toUpperCase() === "BLOCK") {
        cursor.next();
        readBlockDefinition(cursor, state);
        continue;
      }
      const raw = readRawEntity(cursor);
      if (!raw) return;
      readEntityFromRaw(state, raw, cursor, null);
    }
  } catch (error) {
    if (error instanceof EntityLimitReached) {
      state.counters.entitiesTruncated = true;
      addLimitation(state, `the drawing carries more than ${state.limits.maxEntities} entities; reading stopped at that limit and the remainder was not inspected`);
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildDocumentFacts(state: InspectorState, decision: DxfFormatDecision, fallbackEncoding: boolean): DxfDocumentFacts {
  const rawOf = (name: string) => state.headerRaw.get(name) ?? [];
  const codePage = rawOf("$DWGCODEPAGE").find((entry) => entry.code === 3 || entry.code === 1)?.value ?? null;
  const measurementRaw = rawOf("$MEASUREMENT").find((entry) => entry.code === 70);
  const insunitsRaw = rawOf("$INSUNITS").find((entry) => entry.code === 70);
  const extmin = rawOf("$EXTMIN");
  const extmax = rawOf("$EXTMAX");
  const declaredExtents = extmin.length && extmax.length
    ? {
      min: { x: numberOf(extmin.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 10), y: numberOf(extmin.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 20), z: numberOf(extmin.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 30) },
      max: { x: numberOf(extmax.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 10), y: numberOf(extmax.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 20), z: numberOf(extmax.map((entry) => ({ code: entry.code, value: entry.value, line: 0 })), 30) },
    }
    : null;

  const limitations: string[] = [...decision.limitations];
  if (fallbackEncoding) {
    limitations.push("the drawing declared or implied a legacy code page, so its text was decoded with a single-byte fallback; characters outside it may not read exactly");
  }
  if (!codePage) limitations.push("the drawing did not declare a code page ($DWGCODEPAGE), so text was decoded as UTF-8");

  const variables = [...state.headerRaw.entries()].flatMap(([name, entries]) => entries.map((entry) => ({
    name,
    raw: entry.value,
    locator: formatDxfLocator({ section: "HEADER" }) + `:variable=${name}`,
  })));

  return {
    format: "ASCII_DXF",
    version: dxfVersionFromCode(rawOf("$ACADVER").find((entry) => entry.code === 1)?.value ?? null),
    units: insunitsRaw
      ? dxfUnitsFromCode(numericGroupValue(insunitsRaw.code, insunitsRaw.value), insunitsRaw.value)
      : dxfUnitsFromCode(null, null),
    codePage,
    measurement: measurementRaw ? numericGroupValue(measurementRaw.code, measurementRaw.value) : null,
    handleSeed: rawOf("$HANDSEED").find((entry) => entry.code === 5)?.value ?? null,
    declaredExtents,
    headerVariables: variables.slice(0, state.limits.maxHeaderVariables),
    sectionsPresent: state.sectionsPresent,
    limitations: [...new Set(limitations)].slice(0, MAX_DXF_LIMITATIONS),
  };
}

/**
 * Resolves paper-space layout names after the whole file has been read.
 *
 * The LAYOUT objects that name a paper space live in the OBJECTS section, and a
 * DXF always writes OBJECTS after ENTITIES. So while entities are being parsed
 * their layout is not yet knowable, and it has to be filled in here rather than
 * guessed earlier. When the drawing defines exactly one layout, that layout
 * names every paper-space record; when it defines several, only records whose
 * owner handle identifies a specific block record are labelled, and the rest
 * stay unlabeled rather than being given a plausible-sounding name.
 */
function finalizePaperSpaceLayouts(state: InspectorState): void {
  const layouts = [...state.layouts.entries()];
  const onlyLayout = layouts.length === 1 ? layouts[0]![1] : null;
  const labelFor = (ownerHandle: string | null): string | null => {
    if (ownerHandle && state.layouts.has(ownerHandle)) return state.layouts.get(ownerHandle) ?? null;
    return onlyLayout;
  };
  const apply = (record: { space: DxfSpace; layoutName: string | null; ownerHandle: string | null; locator: string; layerName: string | null; handle: string | null }) => {
    if (record.space !== "PAPER_SPACE" || record.layoutName) return;
    const layout = labelFor(record.ownerHandle);
    if (!layout) return;
    record.layoutName = layout;
    // The locator names the layout, so it is rebuilt rather than left pointing
    // at a less specific place than the record now knows. The paper-space block
    // is deliberately not carried as `block=`: it is the space owner, not a
    // block definition containing the entity, and printing it as one would send
    // a reviewer looking inside a block that has no design content.
    record.locator = formatDxfLocator({
      section: "PAPER_SPACE",
      layoutName: layout,
      entityHandle: record.handle,
      ownerHandle: record.ownerHandle,
      layerName: record.layerName,
    });
  };
  for (const entity of state.entities) apply(entity);
  for (const text of state.texts) {
    if (text.space !== "PAPER_SPACE" || text.layoutName) continue;
    const layout = labelFor(text.ownerHandle);
    if (layout) text.layoutName = layout;
  }
  for (const insert of state.inserts) {
    if (insert.space !== "PAPER_SPACE" || insert.layoutName) continue;
    const layout = labelFor(insert.ownerHandle);
    if (layout) insert.layoutName = layout;
  }
}

/**
 * Resolves which inserts point at blocks the drawing never defines.
 *
 * Done as a pass after the whole file is read rather than while entities are
 * parsed, because DXF does not guarantee that BLOCKS precedes ENTITIES. An
 * insert of an undefined block is a real defect in the source file and is
 * reported as one; silently treating it as defined would hide a drawing problem
 * from the person reviewing it.
 */
function finalizeInsertBlockReferences(state: InspectorState): void {
  for (const insert of state.inserts) {
    if (!insert.blockName) continue;
    const missing = !state.blocks.has(insert.blockName);
    if (missing === insert.blockMissing) continue;
    insert.blockMissing = missing;
    const note = `the drawing inserts the block '${insert.blockName}' but defines no block with that name`;
    if (missing && !insert.limitations.includes(note)) {
      insert.limitations = [...new Set([...insert.limitations, note, "the referenced block is undefined in this file, so its contents could not be inspected"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
    } else {
      insert.limitations = insert.limitations.filter((entry) => entry !== note);
    }
    const block = state.blocks.get(insert.blockName);
    if (block) {
      block.insertCount += 1;
      if (insert.handle) block.insertHandles.push(insert.handle);
    }
  }
}

function finalizeSpaces(state: InspectorState): void {
  const paperLayouts = [...new Set([...state.layouts.values()])];
  const paper = state.spaces.PAPER_SPACE!;
  if (paperLayouts.length === 1) paper.layoutName = paperLayouts[0]!;
  else if (paperLayouts.length > 1) paper.layoutName = paperLayouts.join(", ");
  for (const summary of Object.values(state.spaces)) {
    if (summary.entityCount > summary.entities.length) summary.truncated = true;
    if (summary.space === "UNKNOWN_SPACE" && summary.entityCount > 0) {
      summary.limitations = [...new Set([...summary.limitations, "these entities sit inside block definitions, which have no space of their own until a specific insert places them; model space and paper space were not merged to resolve this"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
    }
    if (summary.space === "PAPER_SPACE") {
      summary.limitations = [...new Set([...summary.limitations, "paper space holds title blocks, notes, layouts, and annotations; it was kept separate from model space and not deduplicated against it"])].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
    }
  }
}

/**
 * Inspects ASCII DXF bytes and returns bounded CAD evidence.
 *
 * Throws `DxfInspectionError` when the bytes are not an inspectable ASCII DXF.
 * The error message names the format that was actually found, so a DWG is
 * reported as a DWG rather than as a generic failure.
 */
export function inspectDxfDocument(
  bytes: Uint8Array,
  options: { filename?: string | null; mimeType?: string | null; limits?: Partial<DxfInspectionLimits> } = {},
): DxfInspection {
  const limits: DxfInspectionLimits = { ...DEFAULT_DXF_LIMITS, ...(options.limits ?? {}) };
  const decision = detectDxfFormat({ bytes, filename: options.filename, mimeType: options.mimeType });
  if (!decision.supported) {
    throw new DxfInspectionError(`DXF_UNSUPPORTED_${decision.format}`, decision.reason);
  }
  const { text, usedFallback } = decodeDxfText(bytes);
  const cursor = new DxfGroupCodeCursor(text, { maxPairs: limits.maxGroupCodesScanned });
  const state = newState(limits);

  for (;;) {
    const group = cursor.peek();
    if (!group) break;
    if (group.code === 0 && group.value.toUpperCase() === "EOF") { cursor.next(); break; }
    if (group.code !== 0 || group.value.toUpperCase() !== "SECTION") { cursor.next(); continue; }
    cursor.next(); // consume 0/SECTION
    const nameGroup = cursor.peek();
    const sectionName = nameGroup && nameGroup.code === 2 ? cursor.next()!.value.toUpperCase() : "";
    if (sectionName && !state.sectionsPresent.includes(sectionName)) state.sectionsPresent.push(sectionName);
    switch (sectionName) {
      case "HEADER": readHeaderSection(cursor, state); break;
      case "TABLES": readTablesSection(cursor, state); break;
      case "OBJECTS": readObjectsSection(cursor, state); break;
      case "BLOCKS": readEntitySection(cursor, state, "BLOCKS"); break;
      case "ENTITIES": readEntitySection(cursor, state, "ENTITIES"); break;
      default:
        // CLASSES and any other section are skipped pair by pair until ENDSEC.
        cursor.readUntil((entry) => entry.code === 0 && entry.value.toUpperCase() === "ENDSEC");
        {
          const end = cursor.peek();
          if (end && end.code === 0 && end.value.toUpperCase() === "ENDSEC") cursor.next();
        }
    }
  }

  if (cursor.truncated) {
    addLimitation(state, `the drawing exceeded the ${limits.maxGroupCodesScanned} group-code inspection limit; the remainder of the file was not read`);
  }
  if (!cursor.eof) {
    addLimitation(state, "the drawing did not end with the DXF EOF marker, so it may be truncated or only partially written");
  }
  if (state.counters.layersTruncated) addLimitation(state, `more than ${limits.maxLayers} layers were declared; the remainder were counted but not retained`);
  if (state.counters.blocksTruncated) addLimitation(state, `more than ${limits.maxBlocks} block definitions were declared; the remainder were not retained`);
  if (state.counters.textsTruncated) addLimitation(state, `more than ${limits.maxTextRecords} text records were found; the remainder were counted but not retained`);
  if (state.counters.dimensionsTruncated) addLimitation(state, `more than ${limits.maxDimensionRecords} dimension records were found; the remainder were counted but not retained`);
  if (state.counters.externalReferencesTruncated) addLimitation(state, `more than ${limits.maxExternalReferences} external references were found; the remainder were counted but not retained`);
  if (state.counters.headerVariablesTruncated) addLimitation(state, `more than ${limits.maxHeaderVariables} header variables were present; the remainder were not retained`);
  if (state.counters.entitiesTruncated) {
    addLimitation(state, `${state.counters.entitiesRead} entities were read and ${state.counters.entitiesRetained} entity records were retained; the difference is a bounded-inspection effect, not an equipment count`);
  }
  if (state.externalReferences.length > 0) {
    addLimitation(state, "the drawing references external CAD file(s); the referenced files were not opened, fetched, or resolved");
  }

  finalizePaperSpaceLayouts(state);
  finalizeInsertBlockReferences(state);
  finalizeSpaces(state);

  const truncated = cursor.truncated
    || state.counters.layersTruncated
    || state.counters.blocksTruncated
    || state.counters.textsTruncated
    || state.counters.dimensionsTruncated
    || state.counters.entitiesTruncated
    || state.counters.externalReferencesTruncated
    || Object.values(state.spaces).some((summary) => summary.truncated);

  return {
    format: "ASCII_DXF",
    sizeBytes: bytes.byteLength,
    document: buildDocumentFacts(state, decision, usedFallback),
    layers: [...state.layers.values()],
    blocks: [...state.blocks.values()],
    inserts: state.inserts,
    texts: state.texts,
    dimensions: state.dimensions,
    attributes: state.attributes,
    entities: state.entities,
    spaces: {
      MODEL_SPACE: state.spaces.MODEL_SPACE!,
      PAPER_SPACE: state.spaces.PAPER_SPACE!,
      UNKNOWN_SPACE: state.spaces.UNKNOWN_SPACE!,
    },
    externalReferences: state.externalReferences,
    entityCount: state.counters.entitiesRead,
    entityRecordsRetained: state.entities.length,
    entityTypeCounts: state.entityTypeCounts,
    unmodelledEntityTypes: [...state.unmodelled].sort(),
    truncated,
    limitations: [...new Set([DXF_BASELINE_LIMITATION, DXF_NO_COUNT_LIMITATION, ...state.limitations])].slice(0, MAX_DXF_LIMITATIONS),
  };
}

export { DXF_PAGE_NUMBER };
