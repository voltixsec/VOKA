import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface JsonlLine {
  lineNumber: number;
  content: string;
}

export interface IJsonlLineReader {
  readLines(): AsyncIterable<JsonlLine>;
}

export class NodeJsJsonlLineReader implements IJsonlLineReader {
  public constructor(
    private readonly filePath: string,
    private readonly highWaterMark = 64 * 1024,
  ) {}

  public async *readLines(): AsyncIterable<JsonlLine> {
    const input = createReadStream(this.filePath, {
      encoding: "utf8",
      highWaterMark: this.highWaterMark,
    });

    const lines = createInterface({
      input,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;

    try {
      for await (const line of lines) {
        lineNumber += 1;

        if (line.trim().length === 0) {
          continue;
        }

        yield {
          lineNumber,
          content: line,
        };
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }
}

export class InMemoryJsonlLineReader implements IJsonlLineReader {
  public constructor(private readonly lines: readonly string[]) {}

  public async *readLines(): AsyncIterable<JsonlLine> {
    for (let index = 0; index < this.lines.length; index += 1) {
      const content = this.lines[index];

      if (content.trim().length === 0) {
        continue;
      }

      yield {
        lineNumber: index + 1,
        content,
      };
    }
  }
}
