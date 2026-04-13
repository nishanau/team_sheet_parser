/**
 * Capitalises the first letter of every word in a string.
 * Used to normalise player names before validation and storage.
 *
 * NOTE: Only the first character of each word is uppercased — existing
 * uppercase characters are preserved. "JOHN SMITH" stays "JOHN SMITH".
 * This is intentional: both sides of every comparison run through this
 * function, so casing is consistent regardless of source.
 */
export function toTitleCase(input: string): string {
  return input.replace(/\b\w/g, (c) => c.toUpperCase());
}
