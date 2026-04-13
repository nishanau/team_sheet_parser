/**
 * Capitalises the first letter of every word in a string.
 * Used to normalise player names before validation and storage.
 */
export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
