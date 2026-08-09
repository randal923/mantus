/**
 * Copies `next`, reusing every subtree of `prev` that is deep-equal, so an
 * unchanged part of a fresh server snapshot keeps its old object identity and
 * memoized UI or equality checks can skip it. Values are plain JSON data;
 * explicitly-undefined object entries are not distinguished from absent ones.
 */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return next;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let equal = prev.length === next.length;
    const merged = next.map((value, index) => {
      const reused = replaceEqualDeep(prev[index], value);
      if (reused !== prev[index]) equal = false;
      return reused;
    });
    return equal ? (prev as T) : (merged as T);
  }
  if (isRecord(prev) && isRecord(next)) {
    const keys = Object.keys(next);
    let equal = Object.keys(prev).length === keys.length;
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const reused = replaceEqualDeep(prev[key], next[key]);
      if (reused !== prev[key]) equal = false;
      merged[key] = reused;
    }
    return equal ? (prev as T) : (merged as T);
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}
