/**
 * Phase 2A-8 test fixtures: real textual IFC STEP files.
 *
 * These are genuine ISO-10303-21 physical files, not JSON stand-ins. Every
 * fixture is assembled from STEP entity records the way an authoring tool
 * writes them, so the suite exercises the real reader against real syntax:
 * HEADER/DATA framing, quoted strings (including doubled apostrophes), nested
 * lists, comments, typed values, and IFCREL* relationships.
 */

export function stepString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

export function ifcEntity(id: number, type: string, args: string): string {
  return `#${id}=${type.toUpperCase()}(${args});`;
}

export type IfcDocumentOptions = {
  schema?: string;
  fileName?: string;
  description?: string;
  entities?: string[];
  endIso?: boolean;
};

/** Wraps DATA entities in a well-formed ISO-10303-21 physical file. */
export function ifcDocument(options: IfcDocumentOptions = {}): string {
  const schema = options.schema ?? "IFC4";
  const fileName = options.fileName ?? "building.ifc";
  const description = options.description ?? "ViewDefinition [CoordinationView]";
  const entities = (options.entities ?? []).join("\n");
  const end = options.endIso === false ? "" : "END-ISO-10303-21;\n";
  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${stepString(description)}),'2;1');`,
    `FILE_NAME(${stepString(fileName)},'2026-09-12T00:00:00',('Author'),('Org'),'VOKA-Test','VOKA','');`,
    `FILE_SCHEMA(('${schema}'));`,
    "ENDSEC;",
    "DATA;",
    entities,
    "ENDSEC;",
    end,
  ].filter((line, index, all) => !(line === "" && index === all.length - 1)).join("\n");
}

function rootArgs(input: {
  globalId: string;
  name?: string | null;
  description?: string | null;
  objectType?: string | null;
  placement?: string;
  representation?: string;
  tag?: string | null;
  extra?: string;
}): string {
  const name = input.name == null ? "$" : stepString(input.name);
  const description = input.description == null ? "$" : stepString(input.description);
  const objectType = input.objectType == null ? "$" : stepString(input.objectType);
  const tag = input.tag == null ? "$" : stepString(input.tag);
  const extra = input.extra ? `,${input.extra}` : "";
  return `${stepString(input.globalId)},$,${name},${description},${objectType},${input.placement ?? "$"},${input.representation ?? "$"},${tag}${extra}`;
}

/**
 * A complete IFC4 building: project/site/building/storey/space, a typed fire
 * terminal with psets, declared quantities, units, material, system,
 * classification, document reference, placement/representation metadata, and
 * an explicit IFCRELCONNECTS that must never become engineering topology.
 */
export function fullIfcModel(): string {
  return ifcDocument({
    schema: "IFC4",
    fileName: "seafront.ifc",
    entities: [
      ifcEntity(1, "IFCSIUNIT", "*,.LENGTHUNIT.,.MILLI.,.METRE."),
      ifcEntity(2, "IFCSIUNIT", "*,.AREAUNIT.,$,.SQUARE_METRE."),
      ifcEntity(3, "IFCUNITASSIGNMENT", "(#1,#2)"),
      ifcEntity(10, "IFCCARTESIANPOINT", "((0.,0.,0.))"),
      ifcEntity(11, "IFCDIRECTION", "((0.,0.,1.))"),
      ifcEntity(12, "IFCAXIS2PLACEMENT3D", "(#10,#11,$)"),
      ifcEntity(13, "IFCLOCALPLACEMENT", "(#12,$)"),
      ifcEntity(14, "IFCSHAPEREPRESENTATION", "(#10,'Body','SweptSolid',(#10))"),
      ifcEntity(15, "IFCPRODUCTDEFINITIONSHAPE", "($,$,(#14))"),
      ifcEntity(20, "IFCPROJECT", `${stepString("2xProjectGlobalId0000001")},$,${stepString("Seafront Tower")},$,$,$,$,$,#3`),
      ifcEntity(21, "IFCSITE", `${rootArgs({ globalId: "2xSiteGlobalId0000000002", name: "Main Site" })},$,0.0`),
      ifcEntity(22, "IFCBUILDING", `${rootArgs({ globalId: "2xBuildingGlobalId000003", name: "Tower A" })},$,$`),
      ifcEntity(23, "IFCBUILDINGSTOREY", `${rootArgs({ globalId: "2xStoreyGlobalId00000004", name: "L1" })},${stepString("Level 1")},.ELEMENT.,0.0`),
      ifcEntity(24, "IFCBUILDINGSTOREY", `${rootArgs({ globalId: "2xStoreyGlobalId00000005", name: "L2" })},${stepString("Level 2")},.ELEMENT.,4000.0`),
      ifcEntity(25, "IFCSPACE", `${rootArgs({ globalId: "2xSpaceGlobalId000000006", name: "S-101" })},${stepString("Lobby")},.ELEMENT.,$`),
      ifcEntity(30, "IFCFIRESUPPRESSIONTERMINAL", rootArgs({
        globalId: "2xTerminalGlobalId0000007",
        name: "SD-01",
        objectType: "Smoke Detector",
        placement: "#13",
        representation: "#15",
        tag: "SD",
      })),
      ifcEntity(31, "IFCFLOWTERMINALTYPE", `${stepString("2xTypeGlobalId0000000008")},$,${stepString("Smoke Detector Type")},$,$,$,$,$`),
      ifcEntity(32, "IFCWALL", rootArgs({
        globalId: "2xWallGlobalId0000000009",
        name: "W-101",
        tag: "W1",
      })),
      ifcEntity(33, "IFCBUILDINGELEMENTPROXY", rootArgs({
        globalId: "2xProxyGlobalId000000010",
        name: "Heat Detector",
        objectType: "Smoke Detector",
        tag: "HD-01",
      })),
      ifcEntity(40, "IFCPROPERTYSINGLEVALUE", `${stepString("Manufacturer")},$,IFCIDENTIFIER(${stepString("Siemens")}),$`),
      ifcEntity(41, "IFCPROPERTYSINGLEVALUE", `${stepString("ModelReference")},$,IFCIDENTIFIER(${stepString("ABC-123")}),$`),
      ifcEntity(42, "IFCPROPERTYSET", `${stepString("2xPsetGlobalId0000000011")},$,${stepString("Pset_ManufacturerTypeInformation")},$,(#40,#41)`),
      ifcEntity(43, "IFCQUANTITYAREA", `${stepString("GrossFloorArea")},$,#2,42.5`),
      ifcEntity(44, "IFCELEMENTQUANTITY", `${stepString("2xQtoGlobalId0000000012")},$,${stepString("Qto_SpaceBaseQuantities")},$,$,(#43)`),
      ifcEntity(50, "IFCMATERIAL", `${stepString("Concrete")}`),
      ifcEntity(51, "IFCDISTRIBUTIONSYSTEM", `${stepString("2xSystemGlobalId00000013")},$,${stepString("Fire Alarm")},$,$,$,$,$`),
      ifcEntity(52, "IFCCLASSIFICATIONREFERENCE", `${stepString("http://class.example/uniclass")},${stepString("Pr_75_50_76")},${stepString("Smoke detectors")}`),
      ifcEntity(53, "IFCDOCUMENTREFERENCE", `${stepString("https://files.example.com/spec.pdf")},${stepString("DOC-1")},${stepString("Fire spec")}`),
      ifcEntity(60, "IFCRELAGGREGATES", `${stepString("2xRelAggProject0000014")},$,$,$,#20,(#21)`),
      ifcEntity(61, "IFCRELAGGREGATES", `${stepString("2xRelAggSite000000015")},$,$,$,#21,(#22)`),
      ifcEntity(62, "IFCRELAGGREGATES", `${stepString("2xRelAggBuilding000016")},$,$,$,#22,(#23,#24)`),
      ifcEntity(63, "IFCRELAGGREGATES", `${stepString("2xRelAggStorey00000017")},$,$,$,#23,(#25)`),
      ifcEntity(64, "IFCRELCONTAINEDINSPATIALSTRUCTURE", `${stepString("2xRelContained0000018")},$,$,$,(#30,#32,#33),#23`),
      ifcEntity(65, "IFCRELDEFINESBYTYPE", `${stepString("2xRelType00000000019")},$,$,$,(#30),#31`),
      ifcEntity(66, "IFCRELDEFINESBYPROPERTIES", `${stepString("2xRelPset00000000020")},$,$,$,(#30),#42`),
      ifcEntity(67, "IFCRELDEFINESBYPROPERTIES", `${stepString("2xRelQto00000000021")},$,$,$,(#25),#44`),
      ifcEntity(68, "IFCRELASSIGNSTOGROUP", `${stepString("2xRelGroup0000000022")},$,$,$,(#30),$,#51`),
      ifcEntity(69, "IFCRELASSOCIATESMATERIAL", `${stepString("2xRelMat00000000023")},$,$,$,(#32),#50`),
      ifcEntity(70, "IFCRELASSOCIATESCLASSIFICATION", `${stepString("2xRelClass000000024")},$,$,$,(#30),#52`),
      ifcEntity(71, "IFCRELASSOCIATESDOCUMENT", `${stepString("2xRelDoc00000000025")},$,$,$,(#30),#53`),
      // Explicit connectivity: recorded as a raw entity, never as CONNECTED_TO.
      ifcEntity(72, "IFCRELCONNECTSELEMENTS", `${stepString("2xRelConnect00000026")},$,$,$,$,#30,#32`),
      ifcEntity(80, "IFCWIERDELEMENT", rootArgs({
        globalId: "2xWeirdGlobalId000000027",
        name: "Unknown Device",
      })),
    ],
  });
}

export function fullIfcBytes(): Buffer {
  return Buffer.from(fullIfcModel(), "utf8");
}

export function ifc2x3Model(): string {
  return ifcDocument({
    schema: "IFC2X3",
    entities: [
      ifcEntity(1, "IFCPROJECT", `${stepString("2x3ProjectId00000000001")},$,${stepString("Legacy Project")},$,$,$,$,$,$`),
      ifcEntity(2, "IFCBUILDING", `${rootArgs({ globalId: "2x3BuildingId0000000002", name: "Hall" })},$,$`),
      ifcEntity(3, "IFCBUILDINGSTOREY", `${rootArgs({ globalId: "2x3StoreyId00000000003", name: "GF" })},${stepString("Ground Floor")},.ELEMENT.,0.0`),
      ifcEntity(4, "IFCRELAGGREGATES", `${stepString("2x3Rel0000000000000004")},$,$,$,#2,(#3)`),
    ],
  });
}

export function ifc4x3Model(): string {
  return ifcDocument({
    schema: "IFC4X3_ADD2",
    entities: [
      ifcEntity(1, "IFCPROJECT", `${stepString("4x3ProjectId00000000001")},$,${stepString("Rail Project")},$,$,$,$,$,$`),
      ifcEntity(2, "IFCBUILDING", `${rootArgs({ globalId: "4x3BuildingId0000000002", name: "Station" })},$,$`),
    ],
  });
}

export function ifcWithoutUnits(): string {
  return ifcDocument({
    entities: [
      ifcEntity(1, "IFCPROJECT", `${stepString("nouid00000000000000001")},$,${stepString("No Units")},$,$,$,$,$,$`),
      ifcEntity(2, "IFCSPACE", `${rootArgs({ globalId: "nouid00000000000000002", name: "R1" })},${stepString("Room")},$,$`),
    ],
  });
}

export function ifcWithApostropheAndComment(): string {
  return ifcDocument({
    entities: [
      "/* authoring comment that must not become an entity */",
      ifcEntity(1, "IFCPROJECT", `${stepString("apos0000000000000000001")},$,${stepString("Owner's Lounge")},$,$,$,$,$,$`),
      ifcEntity(2, "IFCSPACE", `${rootArgs({ globalId: "apos0000000000000000002", name: "S-1" })},${stepString("Level 1 (Mezzanine)")},$,$`),
    ],
  });
}

export function ifcMissingEndIso(): string {
  return ifcDocument({
    endIso: false,
    entities: [
      ifcEntity(1, "IFCPROJECT", `${stepString("end00000000000000000001")},$,${stepString("Partial")},$,$,$,$,$,$`),
    ],
  });
}

export function ifcNoSchemaEntities(): string {
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION((''),'2;1');",
    "FILE_NAME('empty.ifc','2026-09-12T00:00:00',(''),(''),'','','');",
    "FILE_SCHEMA(());",
    "ENDSEC;",
    "DATA;",
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

export function largeIfcModel(elementCount: number): string {
  const entities = [
    ifcEntity(1, "IFCPROJECT", `${stepString("bigProject0000000000001")},$,${stepString("Large")},$,$,$,$,$,$`),
    ifcEntity(2, "IFCBUILDINGSTOREY", `${rootArgs({ globalId: "bigStorey00000000000002", name: "L1" })},$,$,0.0`),
  ];
  for (let index = 0; index < elementCount; index += 1) {
    const id = 100 + index;
    entities.push(ifcEntity(id, "IFCWALL", rootArgs({
      globalId: `W${String(index).padStart(21, "0")}`.slice(0, 22),
      name: `W-${index}`,
    })));
  }
  return ifcDocument({ entities });
}

export function conflictingIfcModel(): string {
  return ifcDocument({
    entities: [
      ifcEntity(1, "IFCPROJECT", `${stepString("cflProject0000000000001")},$,${stepString("Conflict")},$,$,$,$,$,$`),
      ifcEntity(2, "IFCBUILDINGELEMENTPROXY", rootArgs({
        globalId: "cflDevice00000000000002",
        name: "Heat Detector",
        objectType: "Smoke Detector",
        tag: "SD",
      })),
    ],
  });
}

export function headerOnlyIfc(): string {
  return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nENDSEC;\n";
}

export function malformedIfcProse(): Buffer {
  return Buffer.from("This mentions IFCPROJECT and ISO but is not a STEP file.\n", "utf8");
}

export function zipBytes(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 0x00)]);
}

export function ifczipNamedBytes(): Buffer {
  return zipBytes();
}

export function nwcBytes(): Buffer {
  return Buffer.concat([Buffer.from("NWC"), Buffer.from([0x00, 0xff, 0xfe, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60])]);
}

export { dwgBytes, rvtBytes, binaryDxfBytes } from "./dxfFixtures";
