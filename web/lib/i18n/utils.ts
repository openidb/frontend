/**
 * Pure i18n utility functions extracted for testability.
 */

/** Get a nested value from an object by dot-notation path. */
export function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

/** Interpolate parameters into a translation string: {key} → value */
export function interpolate(value: string, params: Record<string, string | number>): string {
  let result = value;
  for (const [paramKey, paramValue] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
  }
  return result;
}
