/**
 * Utility to sanitize objects before sending to Firebase Firestore.
 * Firestore rejects any object containing `undefined` values.
 * This function recursively removes keys with `undefined` values,
 * converts null/undefined inside arrays, and ensures pure JSON-compatible objects.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }

  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        sanitizedObj[key] = sanitizeForFirestore(value);
      }
    }
    return sanitizedObj as T;
  }

  return data;
}
