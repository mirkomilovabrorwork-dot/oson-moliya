/**
 * Recursively converts BigInt values to strings for JSON serialization.
 * Use in every API route that returns data containing BigInt fields.
 */
export function serializeBigInt<T>(obj: T): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  // A Date has no own enumerable keys, so the generic object branch below would
  // walk it into `{}` and every date in every API response would arrive empty.
  // Measured 2026-09-10 on POST /api/capture/voice: `"occurredAt":{}`.
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}
