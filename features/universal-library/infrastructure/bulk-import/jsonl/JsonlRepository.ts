import {
  NodeJsJsonlLineReader,
} from "./JsonlLineReader";

import {
  JsonlProcessor,
  type JsonlParseResult,
} from "./JsonlProcessor";

export interface JsonlRepository {
  processFile(filePath: string): AsyncIterable<JsonlParseResult>;
  parseLine(content: string, lineNumber?: number): JsonlParseResult;
}

export class FileSystemJsonlRepository implements JsonlRepository {
  public constructor(
    private readonly processor: JsonlProcessor = new JsonlProcessor(),
  ) {}

  public async *processFile(
    filePath: string,
  ): AsyncIterable<JsonlParseResult> {
    const reader = new NodeJsJsonlLineReader(filePath);

    for await (const result of this.processor.process(reader)) {
      yield result;
    }
  }

  public parseLine(
    content: string,
    lineNumber = 1,
  ): JsonlParseResult {
    return this.processor.parseLine(content, lineNumber);
  }
}
