/**
 * RFC 8785 JSON Canonicalization Scheme (JCS)
 * Pure TypeScript implementation without external dependencies.
 */
export function canonicalize(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map((item) => (item === undefined ? 'null' : canonicalize(item)));
    return `[${elements.join(',')}]`;
  }

  // Object keys must be sorted by Unicode code points
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalize(value)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

