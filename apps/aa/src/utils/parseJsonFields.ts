import { JsonValue } from '@prisma/client/runtime/library';

export function parseJsonField<T = any>(
  value: JsonValue | null | undefined
): T {
  if (!value) return {} as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {} as T;
    }
  }
  return value as T;
}
