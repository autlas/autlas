/**
 * Глобальные константы приложения.
 * Сюда выносим magic strings/numbers, которые встречаются в нескольких местах.
 */

/**
 * Hub status used to live in the tag system as a magic tag string ("hub").
 * That meant a user couldn't have a real tag literally named "hub" without
 * it accidentally promoting the script. Now it's a proper boolean flag
 * (`Script.is_hub`) and these helpers are gone — anywhere you used to
 * call `hasHubTag(s.tags)` you now read `s.is_hub` directly.
 *
 * The DB migration in db.rs sweeps any pre-existing "hub"/"fav"/"favourites"
 * tag rows into the new column on first launch.
 */

/** Z-index слои. Раньше были разбросаны magic-числа: 10, 50, 200, 10000, 99998. */
export const Z_INDEX = {
  base: 10,
  popover: 50,
  contextMenu: 200,
  dialog: 10000,
  toast: 99998,
} as const;
