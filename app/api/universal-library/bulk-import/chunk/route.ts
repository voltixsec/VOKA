import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, win32 } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as readline from "node:readline";

import { NextResponse } from "next/server";

import {
  MAX_BULK_IMPORT_CHUNK_RECORDS,
  RunBulkImportChunk,
} from "@/features/universal-library/application/bulk-import/RunBulkImportChunk";
import { PrismaBulkImportRunRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportRunRepository";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && timingSafeEqual(a, b);
}

function header(
  request: Request,
  name: string,
  maxLength: number,
): string | null {
  const value = request.headers.get(name)?.trim();

  if (!value) {
    return null;
  }

  if (value.length > maxLength) {
    throw new Error(
      `${name} exceeds the maximum allowed length.`,
    );
  }

  return value;
}

function positiveIntegerHeader(
  request: Request,
  name: string,
): number | null {
  const raw = request.headers.get(name)?.trim();

  if (!raw) {
    return null;
  }

  if (!/^[1-9][0-9]*$/.test(raw)) {
    return null;
  }

  const value = Number(raw);

  return Number.isSafeInteger(value)
    ? value
    : null;
}

async function persistBody(
  request: Request,
  filePath: string,
): Promise<{
  contentHash: string;
  byteLength: number;
}> {
  if (!request.body) {
    throw new Error(
      "Bulk import chunk body is required.",
    );
  }

  const declaredLength = Number(
    request.headers.get("content-length") || 0,
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_UPLOAD_BYTES
  ) {
    throw new Error(
      "Bulk import chunk payload is too large.",
    );
  }

  let byteLength = 0;
  const hash = createHash("sha256");

  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);

      byteLength += buffer.length;

      if (byteLength > MAX_UPLOAD_BYTES) {
        callback(
          new Error(
            "Bulk import chunk payload is too large.",
          ),
        );
        return;
      }

      hash.update(buffer);
      callback(null, buffer);
    },
  });

  await pipeline(
    Readable.fromWeb(request.body as any),
    meter,
    createWriteStream(filePath, {
      flags: "wx",
    }),
  );

  return {
    contentHash: hash.digest("hex"),
    byteLength,
  };
}

async function countRecords(
  filePath: string,
): Promise<number> {
  const reader = readline.createInterface({
    input: createReadStream(filePath, {
      encoding: "utf8",
    }),
    crlfDelay: Infinity,
  });

  let count = 0;

  for await (const line of reader) {
    if (line.trim().length > 0) {
      count += 1;

      if (
        count >
        MAX_BULK_IMPORT_CHUNK_RECORDS
      ) {
        return count;
      }
    }
  }

  return count;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN"],
  async (request, auth) => {
    const configuredSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET
        ?.trim();

    const suppliedSecret =
      request.headers
        .get("x-voka-ucl-bulk-secret")
        ?.trim();

    if (
      !configuredSecret ||
      !suppliedSecret ||
      !safeEqual(
        configuredSecret,
        suppliedSecret,
      )
    ) {
      return errorResponse(
        403,
        "UCL_BULK_IMPORT_FORBIDDEN",
        "Global UCL bulk import authorization failed.",
      );
    }

    let sourceId: string | null;
    let fileName: string;
    let batchExternalKey: string | null;
    let sourceNamespace: string | null;

    try {
      sourceId = header(
        request,
        "x-voka-source-id",
        200,
      );

      fileName = win32.basename(
        header(
          request,
          "x-voka-file-name",
          255,
        ) ?? "bulk-import-chunk.jsonl",
      );

      batchExternalKey = header(
        request,
        "x-voka-batch-external-key",
        300,
      );

      sourceNamespace = header(
        request,
        "x-voka-source-namespace",
        300,
      );
    } catch (error) {
      return errorResponse(
        400,
        "INVALID_BULK_IMPORT_HEADER",
        error instanceof Error
          ? error.message
          : "Invalid bulk import header.",
      );
    }

    if (!sourceId) {
      return errorResponse(
        400,
        "SOURCE_ID_REQUIRED",
        "x-voka-source-id header is required.",
      );
    }

    if (!batchExternalKey) {
      return errorResponse(
        400,
        "BATCH_EXTERNAL_KEY_REQUIRED",
        "x-voka-batch-external-key header is required.",
      );
    }

    const chunkIndex =
      positiveIntegerHeader(
        request,
        "x-voka-chunk-index",
      );

    const chunkCount =
      positiveIntegerHeader(
        request,
        "x-voka-chunk-count",
      );

    if (
      !chunkIndex ||
      !chunkCount ||
      chunkIndex > chunkCount
    ) {
      return errorResponse(
        400,
        "INVALID_CHUNK_COORDINATES",
        "Chunk index/count headers are invalid.",
      );
    }

    const contentType =
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";

    const allowedContentTypes =
      new Set([
        "application/x-ndjson",
        "application/jsonl",
        "text/plain",
        "application/octet-stream",
      ]);

    if (
      contentType &&
      !allowedContentTypes.has(
        contentType,
      )
    ) {
      return errorResponse(
        415,
        "INVALID_CONTENT_TYPE",
        "Bulk import chunk requires a raw JSONL request body.",
      );
    }

    const tempFilePath = join(
      tmpdir(),
      `voka-ucl-bulk-chunk-${randomUUID()}.jsonl`,
    );

    try {
      const persisted =
        await persistBody(
          request,
          tempFilePath,
        );

      const recordCount =
        await countRecords(
          tempFilePath,
        );

      if (recordCount < 1) {
        return errorResponse(
          400,
          "EMPTY_BULK_IMPORT_CHUNK",
          "Bulk import chunk contains no JSONL records.",
        );
      }

      if (
        recordCount >
        MAX_BULK_IMPORT_CHUNK_RECORDS
      ) {
        return errorResponse(
          413,
          "BULK_IMPORT_CHUNK_TOO_LARGE",
          "Bulk import chunk may contain at most 1000 records.",
        );
      }

      const useCase =
        new RunBulkImportChunk(
          new PrismaBulkImportRunRepository(
            prisma,
          ),
          new PrismaUniversalLibraryRepository(
            prisma,
          ),
        );

      const result =
        await useCase.execute({
          sourceId,
          initiatedByUserId:
            auth.user.id,

          filePath:
            tempFilePath,
          fileName,

          contentHash:
            persisted.contentHash,
          byteLength:
            persisted.byteLength,
          recordCount,

          batchExternalKey,
          sourceNamespace,

          chunkIndex,
          chunkCount,
        });

      return apiSuccess(
        result,
        {
          status: 201,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    } catch (error) {
      return errorResponse(
        500,
        "UCL_BULK_IMPORT_CHUNK_FAILED",
        error instanceof Error
          ? error.message.slice(
              0,
              500,
            )
          : "Bulk import chunk failed.",
      );
    } finally {
      await unlink(
        tempFilePath,
      ).catch(() => undefined);
    }
  },
);
