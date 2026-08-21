function canonicalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Raw payload contains a non-finite number.");
    }
    return value;
  }

  if (seen.has(value)) {
    throw new Error("Raw payload must not contain circular references.");
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalize(entry, seen));
    }

    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const entry = record[key];
        if (entry !== undefined) {
          result[key] = canonicalize(entry, seen);
        }
        return result;
      }, {});
  } finally {
    seen.delete(value);
  }
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, new WeakSet()));
}
