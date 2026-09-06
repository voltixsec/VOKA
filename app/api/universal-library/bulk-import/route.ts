import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, win32 } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import * as readline from "node:readline";

import { NextResponse } from "next/server";

import { RunBulkImportFile } from "@/features/universal-library/application/bulk-import/RunBulkImportFile";
import { PrismaBulkImportRunRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportRunRepository";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { apiSuccess, withPlatformAdminAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && timingSafeEqual(a, b);
}

function boundedHeader(
  request: Request,
  name: string,
  maxLength: number,
): string | null {
  const value = request.headers.get(name)?.trim();

  if (!value) {
    return null;
  }

  if (value.length > maxLength) {
    throw new Error(`${name} exceeds the maximum allowed length.`);
  }

  return value;
}

async function countNonBlankRecords(
  filePath: string,
): Promise<number> {
  const input = createReadStream(filePath, {
    encoding: "utf8",
  });

  const reader = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  let count = 0;

  for await (const line of reader) {
    if (line.trim().length > 0) {
      count += 1;
    }
  }

  return count;
}

async function persistBody(
  request: Request,
  filePath: string,
): Promise<{
  contentHash: string;
  byteLength: number;
}> {
  if (!request.body) {
    throw new Error("Bulk import request body is required.");
  }

  const declaredLength = Number(
    request.headers.get("content-length") || 0,
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_UPLOAD_BYTES
  ) {
    throw new Error("Bulk import payload is too large.");
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
          new Error("Bulk import payload is too large."),
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

export const POST = withPlatformAdminAuth(
  ["OWNER", "ADMIN"],
  async (request, auth) => {
    const configuredSecret =
      process.env.VOKA_UCL_BULK_IMPORT_SECRET?.trim();

    const suppliedSecret =
      request.headers.get("x-voka-ucl-bulk-secret")?.trim();

    if (
      !configuredSecret ||
      !suppliedSecret ||
      !safeEqual(configuredSecret, suppliedSecret)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UCL_BULK_IMPORT_FORBIDDEN",
            message:
              "Global UCL bulk import authorization failed.",
          },
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const sourceId = boundedHeader(
      request,
      "x-voka-source-id",
      200,
    );

    if (!sourceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SOURCE_ID_REQUIRED",
            message:
              "x-voka-source-id header is required.",
          },
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const rawFileName =
      boundedHeader(request, "x-voka-file-name", 255) ??
      "bulk-import.jsonl";

    // Client paths may use either separator, independently of the server OS.
    const fileName = win32.basename(rawFileName);

    const batchExternalKey = boundedHeader(
      request,
      "x-voka-batch-external-key",
      300,
    );

    const sourceNamespace = boundedHeader(
      request,
      "x-voka-source-namespace",
      300,
    );

    const contentType =
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";

    const allowedContentTypes = new Set([
      "application/x-ndjson",
      "application/jsonl",
      "text/plain",
      "application/octet-stream",
    ]);

    if (
      contentType &&
      !allowedContentTypes.has(contentType)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONTENT_TYPE",
            message:
              "Bulk import requires a raw JSONL request body.",
          },
        },
        {
          status: 415,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const tempFilePath = join(
      tmpdir(),
      `voka-ucl-bulk-${randomUUID()}.jsonl`,
    );

    try {
      const persisted = await persistBody(
        request,
        tempFilePath,
      );

      const recordCount =
        await countNonBlankRecords(tempFilePath);

      if (recordCount < 1) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "EMPTY_BULK_IMPORT",
              message:
                "Bulk import file contains no JSONL records.",
            },
          },
          {
            status: 400,
            headers: {
              "Cache-Control": "no-store",
            },
          },
        );
      }

      const useCase = new RunBulkImportFile(
        new PrismaBulkImportRunRepository(prisma),
        new PrismaUniversalLibraryRepository(prisma),
      );

      const result = await useCase.execute({
        sourceId,
        initiatedByUserId: auth.user.id,
        filePath: tempFilePath,
        fileName,
        contentHash: persisted.contentHash,
        byteLength: persisted.byteLength,
        recordCount,
        batchExternalKey,
        sourceNamespace,
      });

      return apiSuccess(result, {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UCL_BULK_IMPORT_FAILED",
            message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Bulk import failed.",
          },
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    } finally {
      await unlink(tempFilePath).catch(() => undefined);
    }
  },
);
