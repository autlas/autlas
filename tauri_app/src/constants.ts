/**
 * Глобальные константы приложения.
 * Сюда выносим magic strings/numbers, которые встречаются в нескольких местах.
 */

/** Системные теги, которые управляют отображением в Hub. Не показываются как обычные теги. */
export const HUB_TAGS = ["hub", "fav", "favourites"] as const;
export const HUB_TAGS_SET: ReadonlySet<string> = new Set(HUB_TAGS);

/** Проверка является ли тег hub-тегом (case-insensitive). */
export function isHubTag(tag: string): boolean {
  return HUB_TAGS_SET.has(tag.toLowerCase());
}

/** Удалить hub-теги из массива. */
export function withoutHubTags(tags: string[]): string[] {
  return tags.filter(t => !isHubTag(t));
}

/** Содержит ли массив тегов хотя бы один hub-тег. */
export function hasHubTag(tags: string[]): boolean {
  return tags.some(isHubTag);
}

/** Z-index слои. Раньше были разбросаны magic-числа: 10, 50, 200, 10000, 99998. */
export const Z_INDEX = {
  base: 10,
  popover: 50,
  contextMenu: 200,
  dialog: 10000,
  toast: 99998,
} as const;
