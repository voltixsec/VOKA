import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BULK_IMPORT_ENTITY_TYPES,
  BULK_IMPORT_SCHEMA_VERSION,
} from "../../../../domain/bulk-import/BulkImportContract";

import {
  InMemoryJsonlLineReader,
  NodeJsJsonlLineReader,
} from "../JsonlLineReader";

import {
  JsonlProcessor,
  type JsonlInvalidResult,
  type JsonlParseResult,
  type JsonlValidResult,
} from "../JsonlProcessor";

const processor = new JsonlProcessor();
const tempDirs: string[] = [];

function validRecord(
  externalKey = "item-001",
): Record<string, unknown> {
  return {
    schemaVersion: BULK_IMPORT_SCHEMA_VERSION,
    entityType: "ITEM",
    externalKey,
    payload: {},
  };
}

function expectValid(
  result: JsonlParseResult,
): JsonlValidResult {
  expect(result.outcome).toBe("valid");

  if (result.outcome !== "valid") {
    throw new Error(`Expected valid result, got ${result.error.code}`);
  }

  return result;
}

function expectInvalid(
  result: JsonlParseResult,
): JsonlInvalidResult {
  expect(result.outcome).toBe("invalid");

  if (result.outcome !== "invalid") {
    throw new Error("Expected invalid result.");
  }

  return result;
}

async function createTempJsonl(
  content: string,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "voka-jsonl-"));
  tempDirs.push(directory);

  const filePath = join(directory, "input.jsonl");
  await writeFile(filePath, content, "utf8");

  return filePath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();

    if (directory) {
      await rm(directory, {
        recursive: true,
        force: true,
      });
    }
  }
});

describe("JsonlProcessor", () => {
  it("parses a valid minimal record", () => {
    const result = expectValid(
      processor.parseLine(
        JSON.stringify(validRecord()),
        1,
      ),
    );

    expect(result.envelope.externalKey).toBe("item-001");
    expect(result.envelope.payload).toEqual({});
  });

  it("parses a valid rich record and preserves source fields", () => {
    const source = {
      schemaVersion: BULK_IMPORT_SCHEMA_VERSION,
      entityType: "PRODUCT_MODEL",
      externalKey: "manufacturer:model-1",
      sourceRecordId: "source-42",
      sourceUpdatedAt: "2026-09-04T10:00:00Z",
      observedAt: "2026-09-04T11:00:00Z",
      payload: {
        name: "Model 1",
      },
      identifiers: [
        {
          type: "MPN",
          value: "MODEL-1",
        },
      ],
      aliases: [
        {
          value: "Model One",
          locale: "en",
        },
      ],
      attributes: [
        {
          code: "resolution",
          value: 4,
          unit: "MP",
        },
      ],
      marketRelevance: [
        {
          countryCode: "KW",
          relevance: "HIGH",
        },
      ],
      evidence: [
        {
          url: "https://example.com/model-1",
        },
      ],
    };

    const result = expectValid(
      processor.parseLine(JSON.stringify(source), 2),
    );

    expect(result.envelope).toEqual(source);
  });

  it("reports malformed JSON with the real line number", () => {
    const result = expectInvalid(
      processor.parseLine("{ bad json", 7),
    );

    expect(result.error.code).toBe("MALFORMED_JSON");
    expect(result.error.lineNumber).toBe(7);
  });

  it("rejects unsupported schemaVersion with the correct code", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify({
          ...validRecord(),
          schemaVersion: "2.0",
        }),
        8,
      ),
    );

    expect(result.error.code).toBe("INVALID_SCHEMA_VERSION");
    expect(result.error.lineNumber).toBe(8);
  });

  it("rejects unsupported entityType with the correct code", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify({
          ...validRecord(),
          entityType: "UNKNOWN_ENTITY",
        }),
        9,
      ),
    );

    expect(result.error.code).toBe("INVALID_ENTITY_TYPE");
    expect(result.error.lineNumber).toBe(9);
  });

  it("rejects missing externalKey", () => {
    const source = validRecord();
    delete source.externalKey;

    const result = expectInvalid(
      processor.parseLine(JSON.stringify(source), 10),
    );

    expect(result.error.code).toBe("INVALID_EXTERNAL_KEY");
  });

  it("rejects empty externalKey", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify(validRecord("")),
        11,
      ),
    );

    expect(result.error.code).toBe("INVALID_EXTERNAL_KEY");
  });

  it("rejects whitespace-only externalKey", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify(validRecord("   ")),
        12,
      ),
    );

    expect(result.error.code).toBe("INVALID_EXTERNAL_KEY");
  });

  it("preserves the original externalKey value", () => {
    const result = expectValid(
      processor.parseLine(
        JSON.stringify(validRecord("  manufacturer:model-x  ")),
        13,
      ),
    );

    expect(result.envelope.externalKey)
      .toBe("  manufacturer:model-x  ");
  });

  it("rejects missing payload", () => {
    const source = validRecord();
    delete source.payload;

    const result = expectInvalid(
      processor.parseLine(JSON.stringify(source), 14),
    );

    expect(result.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects null payload", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify({
          ...validRecord(),
          payload: null,
        }),
        15,
      ),
    );

    expect(result.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects array payload", () => {
    const result = expectInvalid(
      processor.parseLine(
        JSON.stringify({
          ...validRecord(),
          payload: [],
        }),
        16,
      ),
    );

    expect(result.error.code).toBe("INVALID_PAYLOAD");
  });

  it("keeps absent optional commercial fields absent", () => {
    const result = expectValid(
      processor.parseLine(
        JSON.stringify(validRecord()),
        17,
      ),
    );

    expect(result.envelope).not.toHaveProperty("identifiers");
    expect(result.envelope).not.toHaveProperty("aliases");
    expect(result.envelope).not.toHaveProperty("attributes");
    expect(result.envelope).not.toHaveProperty("marketRelevance");
    expect(result.envelope).not.toHaveProperty("evidence");
  });

  it("does not promote source-controlled processing fields", () => {
    const result = expectValid(
      processor.parseLine(
        JSON.stringify({
          ...validRecord(),
          status: "PUBLISHED",
          payloadHash: "fake-hash",
          matchedItemId: "fake-id",
          retryCount: 99,
          processingStartedAt: "fake",
          processedAt: "fake",
          errorMessage: "fake",
          id: "internal-id",
        }),
        18,
      ),
    );

    expect(result.envelope).not.toHaveProperty("status");
    expect(result.envelope).not.toHaveProperty("payloadHash");
    expect(result.envelope).not.toHaveProperty("matchedItemId");
    expect(result.envelope).not.toHaveProperty("retryCount");
    expect(result.envelope).not.toHaveProperty("processingStartedAt");
    expect(result.envelope).not.toHaveProperty("processedAt");
    expect(result.envelope).not.toHaveProperty("errorMessage");
    expect(result.envelope).not.toHaveProperty("id");
  });

  it("accepts every entity type from the authoritative runtime definition", () => {
    for (const entityType of BULK_IMPORT_ENTITY_TYPES) {
      const result = expectValid(
        processor.parseLine(
          JSON.stringify({
            ...validRecord(`test:${entityType}`),
            entityType,
          }),
          19,
        ),
      );

      expect(result.envelope.entityType).toBe(entityType);
    }
  });

  it("isolates one malformed record between two valid records", async () => {
    const reader = new InMemoryJsonlLineReader([
      JSON.stringify(validRecord("first")),
      "{ broken",
      JSON.stringify(validRecord("third")),
    ]);

    const results: JsonlParseResult[] = [];

    for await (const result of processor.process(reader)) {
      results.push(result);
    }

    expect(results).toHaveLength(3);
    expect(expectValid(results[0]).envelope.externalKey).toBe("first");
    expect(expectInvalid(results[1]).error.code).toBe("MALFORMED_JSON");
    expect(expectValid(results[2]).envelope.externalKey).toBe("third");
  });
});

describe("NodeJsJsonlLineReader", () => {
  it("ignores blank physical lines while preserving physical line numbers", async () => {
    const filePath = await createTempJsonl(
      [
        "",
        "   ",
        JSON.stringify(validRecord("line-three")),
        "",
      ].join("\n"),
    );

    const reader = new NodeJsJsonlLineReader(filePath, 8);
    const lines = [];

    for await (const line of reader.readLines()) {
      lines.push(line);
    }

    expect(lines).toHaveLength(1);
    expect(lines[0].lineNumber).toBe(3);
    expect(lines[0].content).toContain("line-three");
  });

  it("handles a JSON record split across very small stream chunks", async () => {
    const record = JSON.stringify(
      validRecord("split-across-chunks"),
    );

    const filePath = await createTempJsonl(record);
    const reader = new NodeJsJsonlLineReader(filePath, 2);
    const lines = [];

    for await (const line of reader.readLines()) {
      lines.push(line);
    }

    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe(record);
  });

  it("handles multiple JSON records in one large stream chunk", async () => {
    const first = JSON.stringify(validRecord("first"));
    const second = JSON.stringify(validRecord("second"));

    const filePath = await createTempJsonl(
      `${first}\n${second}\n`,
    );

    const reader = new NodeJsJsonlLineReader(filePath, 64 * 1024);
    const lines = [];

    for await (const line of reader.readLines()) {
      lines.push(line);
    }

    expect(lines.map((line) => line.content))
      .toEqual([first, second]);
  });

  it("preserves UTF-8 when multi-byte characters cross byte chunk boundaries", async () => {
    const record = JSON.stringify({
      ...validRecord("unicode"),
      payload: {
        name: "كاميرا مراقبة عربية",
      },
    });

    const filePath = await createTempJsonl(record);

    // One-byte chunks force multi-byte UTF-8 characters across chunk boundaries.
    const reader = new NodeJsJsonlLineReader(filePath, 1);
    const lines = [];

    for await (const line of reader.readLines()) {
      lines.push(line);
    }

    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe(record);

    const result = expectValid(
      processor.parseLine(lines[0].content, lines[0].lineNumber),
    );

    expect(result.envelope.payload.name)
      .toBe("كاميرا مراقبة عربية");
  });

  it("processes the final JSON record without a trailing newline", async () => {
    const record = JSON.stringify(
      validRecord("no-final-newline"),
    );

    const filePath = await createTempJsonl(record);
    const reader = new NodeJsJsonlLineReader(filePath, 4);

    const lines = [];

    for await (const line of reader.readLines()) {
      lines.push(line);
    }

    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe(record);
    expect(lines[0].lineNumber).toBe(1);
  });

  it("keeps valid neighboring records around a malformed physical line", async () => {
    const filePath = await createTempJsonl(
      [
        JSON.stringify(validRecord("one")),
        "{ malformed json",
        JSON.stringify(validRecord("three")),
      ].join("\n"),
    );

    const reader = new NodeJsJsonlLineReader(filePath, 3);
    const results: JsonlParseResult[] = [];

    for await (const result of processor.process(reader)) {
      results.push(result);
    }

    expect(results).toHaveLength(3);
    expect(expectValid(results[0]).envelope.externalKey).toBe("one");
    expect(expectInvalid(results[1]).error.lineNumber).toBe(2);
    expect(expectValid(results[2]).envelope.externalKey).toBe("three");
  });
});
