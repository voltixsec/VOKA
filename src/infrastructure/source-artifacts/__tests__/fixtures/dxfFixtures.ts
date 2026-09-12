/**
 * Phase 2A-7 test fixtures: real ASCII DXF files.
 *
 * These are genuine DXF group-code files, not JSON stand-ins. Every fixture is
 * assembled from numeric group-code / value pairs the way AutoCAD writes them,
 * so the suite exercises the real reader against real syntax: sections, tables,
 * block records, blocks, entities, and the dependent VERTEX/ATTRIB/SEQEND
 * sequences that a naive parser silently drops.
 */

export type DxfPair = [code: number, value: string];

/** Renders group-code pairs the way a DXF file stores them: code line, value line. */
export function dxfPairs(pairs: DxfPair[]): string {
  return pairs.map(([code, value]) => `${String(code).padStart(3, " ")}\r\n${value}`).join("\r\n");
}

/**
 * Wraps pairs in a named SECTION ... ENDSEC block.
 *
 * An empty body contributes no lines at all. Emitting an empty string here
 * would leave a blank line between the name and ENDSEC, which breaks the
 * two-lines-per-pair alignment a DXF reader depends on.
 */
export function dxfSection(name: string, pairs: DxfPair[]): string {
  const body = pairs.length ? `\r\n${dxfPairs(pairs)}` : "";
  return `${dxfPairs([[0, "SECTION"], [2, name]])}${body}\r\n${dxfPairs([[0, "ENDSEC"]])}`;
}

export type DxfFixtureOptions = {
  /** $ACADVER. Omit to leave the drawing with no declared version. */
  acadver?: string;
  /** $INSUNITS. Omit entirely to leave the units undeclared. */
  insunits?: number;
  codePage?: string;
  extents?: { min: [number, number, number]; max: [number, number, number] };
  /** Extra HEADER variables. */
  header?: DxfPair[];
  layers?: DxfPair[];
  blockRecords?: DxfPair[];
  blocks?: string;
  entities?: DxfPair[];
  objects?: DxfPair[];
  /** Whether to terminate with the DXF EOF marker. */
  eof?: boolean;
};

/** Builds a complete, structurally valid ASCII DXF file. */
export function dxfDocument(options: DxfFixtureOptions = {}): string {
  const header: DxfPair[] = [];
  if (options.acadver !== undefined) header.push([9, "$ACADVER"], [1, options.acadver]);
  if (options.codePage !== undefined) header.push([9, "$DWGCODEPAGE"], [3, options.codePage]);
  if (options.insunits !== undefined) header.push([9, "$INSUNITS"], [70, String(options.insunits)]);
  if (options.extents) {
    header.push(
      [9, "$EXTMIN"], [10, String(options.extents.min[0])], [20, String(options.extents.min[1])], [30, String(options.extents.min[2])],
      [9, "$EXTMAX"], [10, String(options.extents.max[0])], [20, String(options.extents.max[1])], [30, String(options.extents.max[2])],
    );
  }
  header.push(...(options.header ?? []));

  const tables = dxfSection("TABLES", [
    [0, "TABLE"], [2, "LAYER"], [70, String(options.layers?.length ?? 0)],
    ...(options.layers ?? []),
    [0, "ENDTAB"],
    [0, "TABLE"], [2, "BLOCK_RECORD"], [70, String(options.blockRecords?.length ?? 0)],
    ...(options.blockRecords ?? []),
    [0, "ENDTAB"],
  ]);

  const sections = options.header || options.acadver !== undefined || options.insunits !== undefined || options.codePage !== undefined || options.extents
    ? [dxfSection("HEADER", header), tables]
    : [tables];
  if (options.blocks !== undefined) {
    sections.push(`${dxfPairs([[0, "SECTION"], [2, "BLOCKS"]])}\r\n${options.blocks}\r\n${dxfPairs([[0, "ENDSEC"]])}`);
  }
  sections.push(dxfSection("ENTITIES", options.entities ?? []));
  if (options.objects) sections.push(dxfSection("OBJECTS", options.objects));
  return `${sections.join("\r\n")}\r\n${options.eof === false ? "" : `${dxfPairs([[0, "EOF"]])}\r\n`}`;
}

// ---------------------------------------------------------------------------
// Shared table fragments
// ---------------------------------------------------------------------------

/** The standard space-owning block records every real drawing carries. */
export const SPACE_BLOCK_RECORDS: DxfPair[] = [
  [0, "BLOCK_RECORD"], [5, "1F"], [330, "5"], [2, "*Model_Space"],
  [0, "BLOCK_RECORD"], [5, "1B"], [330, "5"], [2, "*Paper_Space"],
];

/**
 * A layer record with the real group-62 sign convention and group-70 flag bits.
 *
 * `flags` 1 = frozen, 2 = frozen by default in new viewports, 4 = locked. A
 * negative `color` means the layer is switched off, which is a different state
 * from frozen and must not be collapsed into it.
 */
export function layerRecord(input: { name: string; handle: string; flags?: number; color?: number; lineType?: string }): DxfPair[] {
  return [
    [0, "LAYER"], [5, input.handle], [330, "2"],
    [2, input.name],
    [70, String(input.flags ?? 0)],
    [62, String(input.color ?? 7)],
    [6, input.lineType ?? "Continuous"],
  ];
}

export function blockRecord(handle: string, name: string): DxfPair[] {
  return [[0, "BLOCK_RECORD"], [5, handle], [330, "5"], [2, name]];
}

/** A BLOCK ... entities ... ENDBLK definition. */
export function blockDefinition(input: {
  name: string;
  handle: string;
  owner?: string;
  layer?: string;
  flags?: number;
  basePoint?: [number, number, number];
  xrefPath?: string;
  entities?: DxfPair[];
}): string {
  const pairs: DxfPair[] = [
    [0, "BLOCK"], [5, input.handle], [330, input.owner ?? "1F"],
    [8, input.layer ?? "0"], [2, input.name],
    [70, String(input.flags ?? 0)],
    [10, String(input.basePoint?.[0] ?? 0)], [20, String(input.basePoint?.[1] ?? 0)], [30, String(input.basePoint?.[2] ?? 0)],
    [3, input.name],
    [1, input.xrefPath ?? ""],
  ];
  const body = dxfPairs(input.entities ?? []);
  const endblk = dxfPairs([[0, "ENDBLK"], [5, `${input.handle}E`], [330, input.owner ?? "1F"]]);
  return `${dxfPairs(pairs)}\r\n${body}${body ? "\r\n" : ""}${endblk}`;
}

// ---------------------------------------------------------------------------
// Named fixtures
// ---------------------------------------------------------------------------

/**
 * A complete MEP-style drawing: model space geometry, a device block with an
 * attribute definition, an insert carrying an attribute, text, multiline text,
 * a dimension, a heavy polyline, a paper space layout, and an external
 * reference. This is the fixture most assertions run against.
 */
export function fullDrawing(): string {
  const layers = [
    ...layerRecord({ name: "0", handle: "10", flags: 0, color: 7 }),
    ...layerRecord({ name: "FIRE_ALARM", handle: "2A", flags: 0, color: 1, lineType: "DASHED" }),
    ...layerRecord({ name: "CCTV", handle: "2B", flags: 1, color: 5 }),
    ...layerRecord({ name: "E-EQUIP", handle: "2C", flags: 4, color: -3, lineType: "HIDDEN" }),
    ...layerRecord({ name: "A-DOOR", handle: "2D", flags: 0, color: 8 }),
  ];

  const blocks = [
    // Model-space and paper-space owners. Real drawings carry these, and they
    // are what makes an entity's space provable rather than assumed.
    blockDefinition({ name: "*Model_Space", handle: "20", owner: "1F" }),
    blockDefinition({ name: "*Paper_Space", handle: "21", owner: "1B" }),
    // A device block: a circle plus an attribute definition naming the field.
    blockDefinition({
      name: "SD",
      handle: "30",
      layer: "FIRE_ALARM",
      entities: [
        [0, "CIRCLE"], [5, "31"], [330, "30"], [8, "FIRE_ALARM"],
        [10, "0.0"], [20, "0.0"], [30, "0.0"], [40, "100.0"],
        [0, "ATTDEF"], [5, "32"], [330, "30"], [8, "FIRE_ALARM"],
        [10, "10.0"], [20, "10.0"], [30, "0.0"],
        [1, "SD"], [2, "DEVICE_TYPE"], [3, "Device type:"], [40, "5.0"],
        [0, "ATTDEF"], [5, "33"], [330, "30"], [8, "FIRE_ALARM"],
        [10, "10.0"], [20, "20.0"], [30, "0.0"],
        [1, "ABC-123"], [2, "MODEL"], [3, "Model:"], [40, "5.0"],
      ],
    }),
    // An external reference. The path is metadata; it is never opened.
    blockDefinition({ name: "SITE_XREF", handle: "40", flags: 4, xrefPath: "C:\\site\\ref\\site.dwg" }),
  ].join("\r\n");

  const entities: DxfPair[] = [
    [0, "LINE"], [5, "3AF"], [330, "1F"], [8, "FIRE_ALARM"], [62, "1"], [6, "DASHED"],
    [10, "0.0"], [20, "0.0"], [30, "0.0"],
    [11, "1000.0"], [21, "500.0"], [31, "0.0"],

    [0, "LWPOLYLINE"], [5, "3B0"], [330, "1F"], [8, "0"],
    [90, "3"], [70, "1"],
    [10, "0.0"], [20, "0.0"], [10, "10.0"], [20, "0.0"], [10, "10.0"], [20, "10.0"],

    // A heavy polyline: the vertices live in the VERTEX records that follow it,
    // terminated by SEQEND. They belong to the polyline, not to the section.
    [0, "POLYLINE"], [5, "3B1"], [330, "1F"], [8, "0"], [66, "1"], [70, "0"],
    [0, "VERTEX"], [5, "3B2"], [330, "3B1"], [8, "0"], [10, "1.0"], [20, "2.0"], [30, "0.0"],
    [0, "VERTEX"], [5, "3B3"], [330, "3B1"], [8, "0"], [10, "3.0"], [20, "4.0"], [30, "0.0"],
    [0, "VERTEX"], [5, "3B4"], [330, "3B1"], [8, "0"], [10, "5.0"], [20, "6.0"], [30, "0.0"],
    [0, "SEQEND"], [5, "3B5"], [330, "3B1"],

    [0, "CIRCLE"], [5, "3B6"], [330, "1F"], [8, "CCTV"],
    [10, "50.0"], [20, "50.0"], [30, "0.0"], [40, "25.0"],

    [0, "ARC"], [5, "3B7"], [330, "1F"], [8, "CCTV"],
    [10, "50.0"], [20, "50.0"], [30, "0.0"], [40, "25.0"], [50, "0.0"], [51, "90.0"],

    // An ELLIPSE: major axis as a vector (11), axis ratio (40), and bounding
    // parameters in RADIANS (41/42) — not a radius and not degrees.
    [0, "ELLIPSE"], [5, "3BD"], [330, "1F"], [8, "0"],
    [10, "600.0"], [20, "600.0"], [30, "0.0"],
    [11, "100.0"], [21, "0.0"], [31, "0.0"],
    [40, "0.5"], [41, "0.0"], [42, "6.283185307179586"],

    // A SPLINE: control points, degree, and knot values.
    [0, "SPLINE"], [5, "3BE"], [330, "1F"], [8, "0"], [70, "0"], [71, "3"],
    [10, "0.0"], [20, "0.0"], [30, "0.0"],
    [10, "10.0"], [20, "20.0"], [30, "0.0"],
    [10, "20.0"], [20, "0.0"], [30, "0.0"],

    [0, "TEXT"], [5, "3B8"], [330, "1F"], [8, "FIRE_ALARM"],
    [10, "120.0"], [20, "30.0"], [30, "0.0"], [40, "5.0"], [50, "15.0"],
    [1, "Smoke Detector"],

    // MTEXT with real DXF control syntax: a font switch and paragraph breaks.
    [0, "MTEXT"], [5, "3B9"], [330, "1F"], [8, "FIRE_ALARM"],
    [10, "200.0"], [20, "40.0"], [30, "0.0"], [40, "5.0"], [7, "Standard"],
    [1, "{\\fArial|b0|i0;Fire\\PAlarm\\PRiser}"],

    // A dimension. Group 42 is the drawing's own stored measurement; VOKA
    // preserves it and never recomputes it from the definition points.
    [0, "DIMENSION"], [5, "3BA"], [330, "1F"], [8, "0"],
    [10, "0.0"], [20, "-50.0"], [30, "0.0"],
    [13, "0.0"], [23, "0.0"], [33, "0.0"],
    [14, "1000.0"], [24, "0.0"], [34, "0.0"],
    [42, "1000.0"], [1, "<>"], [7, "Standard"], [2, "*D1"], [70, "32"],

    // An insert of the device block, carrying an attribute value.
    [0, "INSERT"], [5, "7C2"], [330, "1F"], [8, "CCTV"], [2, "SD"],
    [10, "300.0"], [20, "300.0"], [30, "0.0"],
    [41, "2.0"], [42, "2.0"], [43, "1.0"], [50, "45.0"], [66, "1"],
    [0, "ATTRIB"], [5, "7C3"], [330, "7C2"], [8, "CCTV"],
    [10, "310.0"], [20, "310.0"], [30, "0.0"], [40, "5.0"],
    [1, "SD"], [2, "DEVICE_TYPE"],
    [0, "ATTRIB"], [5, "7C4"], [330, "7C2"], [8, "CCTV"],
    [10, "310.0"], [20, "320.0"], [30, "0.0"], [40, "5.0"],
    [1, "ABC-123"], [2, "MODEL"],
    [0, "SEQEND"], [5, "7C5"], [330, "7C2"],

    // An insert of a block the drawing never defines: a real, reviewable defect.
    [0, "INSERT"], [5, "7C6"], [330, "1F"], [8, "A-DOOR"], [2, "MISSING_BLOCK"],
    [10, "400.0"], [20, "400.0"], [30, "0.0"],

    // An entity with no handle at all, so positional referencing is exercised.
    [0, "CIRCLE"], [330, "1F"], [8, "E-EQUIP"],
    [10, "9.0"], [20, "9.0"], [30, "0.0"], [40, "1.5"],
  ];

  // Paper space content: a title block note, owned by the paper-space record.
  const objects: DxfPair[] = [
    [0, "LAYOUT"], [5, "1E"], [330, "1A"],
    [100, "AcDbPlotSettings"], [1, ""], [2, "none_device"],
    [100, "AcDbLayout"], [1, "Layout1"], [70, "1"], [71, "1"], [330, "1B"],
  ];

  const paperSpaceEntities: DxfPair[] = [
    [0, "TEXT"], [5, "22B"], [330, "1B"], [8, "0"], [67, "1"],
    [10, "10.0"], [20, "10.0"], [30, "0.0"], [40, "8.0"], [1, "SHEET A-101"],
    [0, "LINE"], [5, "22C"], [330, "1B"], [8, "0"], [67, "1"],
    [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "100.0"], [21, "0.0"], [31, "0.0"],
  ];

  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    codePage: "ANSI_1252",
    extents: { min: [0, 0, 0], max: [1000, 500, 0] },
    header: [[9, "$HANDSEED"], [5, "FFFF"]],
    layers,
    blockRecords: SPACE_BLOCK_RECORDS,
    blocks,
    entities,
    objects,
  })
    // Append the paper-space entities into the *Paper_Space block rather than
    // the ENTITIES section, exactly as a real DXF stores them.
    .replace(
      blockDefinition({ name: "*Paper_Space", handle: "21", owner: "1B" }),
      blockDefinition({ name: "*Paper_Space", handle: "21", owner: "1B", entities: paperSpaceEntities }),
    );
}

/** The full drawing, as bytes. */
export function fullDrawingBytes(): Buffer {
  return Buffer.from(fullDrawing(), "latin1");
}

/** A drawing that declares no $INSUNITS at all. */
export function drawingWithoutUnits(): string {
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    entities: [
      [0, "LINE"], [5, "A1"], [330, "1F"], [8, "0"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "3500.0"], [21, "0.0"], [31, "0.0"],
    ],
  });
}

/** A drawing that declares feet, to prove the declared unit is preserved literally. */
export function drawingWithFeet(): string {
  return dxfDocument({
    acadver: "AC1027",
    insunits: 2,
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    entities: [
      [0, "CIRCLE"], [5, "B1"], [330, "1F"], [8, "0"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"], [40, "12.0"],
    ],
  });
}

/** A drawing with content only in paper space, presented as a named layout. */
export function paperSpaceDrawing(): string {
  const blocks = [
    blockDefinition({ name: "*Model_Space", handle: "20", owner: "1F" }),
    blockDefinition({
      name: "*Paper_Space",
      handle: "21",
      owner: "1B",
      entities: [
        [0, "TEXT"], [5, "C1"], [330, "1B"], [8, "0"], [67, "1"],
        [10, "5.0"], [20, "5.0"], [30, "0.0"], [40, "6.0"], [1, "TITLE BLOCK"],
      ],
    }),
  ].join("\r\n");
  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    blocks,
    entities: [[0, "LINE"], [5, "C2"], [330, "1F"], [8, "0"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "1.0"], [21, "1.0"], [31, "0.0"]],
    objects: [[0, "LAYOUT"], [5, "1E"], [330, "1A"], [100, "AcDbLayout"], [1, "Layout1"], [70, "1"], [330, "1B"]],
  });
}

/**
 * Two blocks that insert each other.
 *
 * A real hazard in CAD files. VOKA never explodes blocks, so the cycle is
 * recorded as two bounded references and cannot expand; the fixture proves the
 * reader terminates rather than relying on that claim.
 */
export function cyclicBlockDrawing(): string {
  const blocks = [
    blockDefinition({
      name: "LOOP_A",
      handle: "50",
      entities: [[0, "INSERT"], [5, "51"], [330, "50"], [8, "0"], [2, "LOOP_B"], [10, "0.0"], [20, "0.0"], [30, "0.0"]],
    }),
    blockDefinition({
      name: "LOOP_B",
      handle: "52",
      entities: [[0, "INSERT"], [5, "53"], [330, "52"], [8, "0"], [2, "LOOP_A"], [10, "1.0"], [20, "1.0"], [30, "0.0"]],
    }),
  ].join("\r\n");
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    blocks,
    entities: [[0, "INSERT"], [5, "54"], [330, "1F"], [8, "0"], [2, "LOOP_A"], [10, "0.0"], [20, "0.0"], [30, "0.0"]],
  });
}

/**
 * A drawing with no BLOCK_RECORD table at all.
 *
 * Older and hand-written DXF files omit it, which removes the owner-handle
 * chain that proves an entity's space. The fixture exists so the reader's
 * fallback to the DXF section convention is exercised and labelled as an
 * assumption rather than silently treated as proof.
 */
export function drawingWithoutBlockRecords(): string {
  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: [],
    entities: [
      [0, "LINE"], [5, "E1"], [330, "1F"], [8, "0"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "10.0"], [21, "10.0"], [31, "0.0"],
    ],
  });
}

/** A drawing carrying more entities than the inspection cap retains. */
export function largeDrawing(entityCount: number): string {
  const entities: DxfPair[] = [];
  for (let index = 0; index < entityCount; index += 1) {
    entities.push(
      [0, "LINE"], [5, index.toString(16).toUpperCase().padStart(4, "0")], [330, "1F"], [8, "0"],
      [10, String(index)], [20, "0.0"], [30, "0.0"],
      [11, String(index + 1)], [21, "1.0"], [31, "0.0"],
    );
  }
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    entities,
  });
}

/**
 * A drawing with many named layers.
 *
 * The assistant brief names at most four layers and then states how many remain,
 * so a drawing that exceeds that cap is what exercises the remainder sentence.
 * `layerRecord` returns a flat pair array, so each record has to be spread into
 * the layer list rather than nested inside it.
 */
export function manyLayersDrawing(namedLayerCount: number): string {
  const layers: DxfPair[] = [...layerRecord({ name: "0", handle: "10" })];
  for (let index = 0; index < namedLayerCount; index += 1) {
    layers.push(...layerRecord({
      name: `E-LAYER-${String(index + 1).padStart(2, "0")}`,
      handle: (0x20 + index).toString(16).toUpperCase(),
      color: 7,
    }));
  }
  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    layers,
    blockRecords: SPACE_BLOCK_RECORDS,
    entities: [
      [0, "LINE"], [5, "300"], [330, "1F"], [8, "E-LAYER-01"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"],
      [11, "10.0"], [21, "10.0"], [31, "0.0"],
    ],
  });
}

/**
 * A drawing defining many named block definitions.
 *
 * The assistant brief names at most four blocks, so a drawing that defines more
 * than four is what exercises the "additional definitions not listed here"
 * disclosure. These are block DEFINITIONS in the BLOCKS table — deliberately not
 * insertions, because a listing of definitions must never be read as a count of
 * placed equipment.
 */
export function manyBlocksDrawing(blockCount: number): string {
  const blockRecords: DxfPair[] = [...SPACE_BLOCK_RECORDS];
  const blocks: string[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const name = `DEV-${String(index + 1).padStart(2, "0")}`;
    const handle = (0x40 + index).toString(16).toUpperCase();
    blockRecords.push(...blockRecord(handle, name));
    blocks.push(blockDefinition({
      name,
      handle: (0x80 + index).toString(16).toUpperCase(),
      entities: [
        [0, "LINE"], [5, (0x100 + index).toString(16).toUpperCase()], [8, "0"],
        [10, "0.0"], [20, "0.0"], [30, "0.0"],
        [11, "5.0"], [21, "5.0"], [31, "0.0"],
      ],
    }));
  }
  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords,
    blocks: blocks.join("\r\n"),
    entities: [
      [0, "LINE"], [5, "300"], [330, "1F"], [8, "0"],
      [10, "0.0"], [20, "0.0"], [30, "0.0"],
      [11, "10.0"], [21, "10.0"], [31, "0.0"],
    ],
  });
}

/** A drawing whose polyline declares an absurd vertex count. */
export function pathologicalPolylineDrawing(vertexCount: number): string {
  const vertices: DxfPair[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    vertices.push([0, "VERTEX"], [5, `V${index}`], [330, "P1"], [8, "0"], [10, String(index)], [20, "0.0"], [30, "0.0"]);
  }
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    entities: [
      [0, "POLYLINE"], [5, "P1"], [330, "1F"], [8, "0"], [66, "1"], [70, "0"],
      ...vertices,
      [0, "SEQEND"], [5, "P2"], [330, "P1"],
    ],
  });
}

/**
 * A drawing whose evidence genuinely disagrees about the same record.
 *
 * The block is named `SD`, which reads as a smoke detector, but the text written
 * twice beside its insert says "Heat Detector". Both readings rest on the same
 * text record, so they conflict — and the correct behaviour is to keep both and
 * choose neither, because choosing would be selecting equipment.
 */
export function conflictingSemanticsDrawing(): string {
  const blocks = [
    blockDefinition({
      name: "SD",
      handle: "70",
      layer: "FIRE_ALARM",
      entities: [
        [0, "CIRCLE"], [5, "71"], [330, "70"], [8, "FIRE_ALARM"],
        [10, "0.0"], [20, "0.0"], [30, "0.0"], [40, "50.0"],
      ],
    }),
  ].join("\r\n");
  return dxfDocument({
    acadver: "AC1027",
    insunits: 4,
    layers: [
      ...layerRecord({ name: "0", handle: "10" }),
      ...layerRecord({ name: "FIRE_ALARM", handle: "2A", color: 1 }),
    ],
    blockRecords: SPACE_BLOCK_RECORDS,
    blocks,
    entities: [
      [0, "INSERT"], [5, "80"], [330, "1F"], [8, "FIRE_ALARM"], [2, "SD"],
      [10, "500.0"], [20, "500.0"], [30, "0.0"],
      [0, "TEXT"], [5, "81"], [330, "1F"], [8, "FIRE_ALARM"],
      [10, "510.0"], [20, "505.0"], [30, "0.0"], [40, "5.0"], [1, "Heat Detector"],
      [0, "TEXT"], [5, "82"], [330, "1F"], [8, "FIRE_ALARM"],
      [10, "510.0"], [20, "515.0"], [30, "0.0"], [40, "5.0"], [1, "Heat Detector"],
    ],
  });
}

/** A drawing with an unresolved external reference over what looks like a network path. */
export function xrefDrawing(): string {
  const blocks = [
    blockDefinition({ name: "REMOTE_XREF", handle: "60", flags: 4, xrefPath: "https://files.example.com/site.dwg" }),
    blockDefinition({ name: "OVERLAY_XREF", handle: "61", flags: 12, xrefPath: "\\\\server\\share\\overlay.dwg" }),
  ].join("\r\n");
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    blocks,
    entities: [[0, "INSERT"], [5, "62"], [330, "1F"], [8, "0"], [2, "REMOTE_XREF"], [10, "0.0"], [20, "0.0"], [30, "0.0"]],
  });
}

// ---------------------------------------------------------------------------
// Things that are NOT an ASCII DXF
// ---------------------------------------------------------------------------

/** Real AutoCAD binary DXF banner. */
export function binaryDxfBytes(): Buffer {
  return Buffer.concat([
    Buffer.from("AutoCAD Binary DXF\r\n", "latin1"),
    Buffer.from([0x1a, 0x00]),
    // Some plausible-looking binary group codes follow; none of it is text.
    Buffer.from([0x00, 0x00, 0x02, 0x48, 0x45, 0x41, 0x44, 0x45, 0x52]),
  ]);
}

/** Real binary DWG: the version string, then binary object data. */
export function dwgBytes(): Buffer {
  return Buffer.concat([
    Buffer.from("AC1027", "latin1"),
    Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x10, 0x20]),
    Buffer.from("R o o t   E n t r y", "latin1"),
  ]);
}

/** An OLE2 compound document, which is what a Revit .rvt file is. */
export function rvtBytes(): Buffer {
  return Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 0x00)]);
}

/** A STEP/IFC physical file header. */
export function ifcBytes(): Buffer {
  return Buffer.from("ISO-10303-21;\r\nHEADER;\r\nFILE_DESCRIPTION((''),'2;1');\r\nENDSEC;\r\n", "latin1");
}

/** Plain prose: not a CAD file at all, despite the .dxf name it may be given. */
export function malformedText(): Buffer {
  return Buffer.from(
    "This is not a drawing.\nIt is a paragraph of prose that mentions SECTION and LAYER\nbut carries no DXF group-code structure whatsoever.\n",
    "latin1",
  );
}

/** Group codes that start well and then stop mid-pair: a truncated drawing. */
export function truncatedDrawing(): string {
  return dxfDocument({
    acadver: "AC1027",
    layers: layerRecord({ name: "0", handle: "10" }),
    blockRecords: SPACE_BLOCK_RECORDS,
    entities: [[0, "LINE"], [5, "D1"], [330, "1F"], [8, "0"], [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "1.0"], [21, "1.0"], [31, "0.0"]],
    eof: false,
  });
}
