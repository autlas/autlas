const SYSTEM_TAGS = new Set(["hub", "fav", "favourites"]);

export function isSystemTag(tag: string): boolean {
  return SYSTEM_TAGS.has(tag.toLowerCase());
}
