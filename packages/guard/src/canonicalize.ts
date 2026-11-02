/**
 * RFC 8785 JSON Canonicalization Scheme (JCS)
 * Pure TypeScript implementation without external dependencies.
 */
export function canonicalize(val: any): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map((item) => (item === undefined ? 'null' : canonicalize(item)));
    return `[${elements.join(',')}]`;
  }

  // Object keys must be sorted by Unicode code points
  const keys = Object.keys(val).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const value = val[key];
    if (value !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalize(value)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

