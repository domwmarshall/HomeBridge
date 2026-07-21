export function errorMessage(
  caught: unknown,
  fallback = "Something went wrong.",
): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  if (caught && typeof caught === "object") {
    const value = caught as Record<string, unknown>;
    const parts = [value.message, value.details, value.hint, value.code].filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0,
    );
    if (parts.length) return [...new Set(parts)].join("\n");
  }
  return fallback;
}
