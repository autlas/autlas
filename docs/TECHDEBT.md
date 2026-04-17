# Техдолг AHK Manager

Аудит от 2026-04-09. Источник: параллельный обход 8 субагентов (архитектура, Rust backend, React hooks, React components, IPC, конфиги, стили, i18n).

Вердикт: **приложение не безупречно**. Есть как косметика, так и реальные проблемы безопасности и надёжности.

---

## 🔴 Критично

### Безопасность (Rust backend)

- **Path injection в `edit_script`** — `src-tauri/src/lib.rs:1394`
  Путь подставляется в PowerShell без экранирования. Кавычка в имени файла → исполнение произвольного кода.
  Фикс: `Command::new` с прямыми аргументами или WinAPI `ShellExecuteW`.

- **Path injection в `open_url`** — `src-tauri/src/lib.rs:1406`
  URL передаётся в `cmd /c start` без валидации. Спецсимволы (`&`, `|`, `;`) не экранированы.

- **CSP отключён** — `src-tauri/tauri.conf.json` (`"csp": null`)
  Нет защиты от XSS в production.

- **`devtools: true` в релизе** — `src-tauri/tauri.conf.json`

- **Tauri capabilities не ограничены** — все плагины (dialog, notification, opener, positioner) открыты по дефолту.

### Reliability

- **Watcher игнорирует ошибки `taskkill`** — `lib.rs:1248-1269, 1280-1297` (`let _ = ...`)
  Скрипт может остаться запущенным, состояние БД рассинхронизируется.

- **Watcher дорогой** — `lib.rs:655-717`
  `System::new_all()` + `refresh_all()` каждые 1.5 с, нет стейт-машины.

- **Блокирующий I/O в async командах** — `lib.rs:1011` (`get_scripts`)
  `WalkDir`, `thread::sleep` внутри `async fn` без `spawn_blocking`.

- **Unsafe GDI+ без проверки статусов** — `lib.rs:125-179`
  `GdipCreateSolidFill` не проверяется → nullptr может попасть в `GdipFillRectangle`.

### React

- **Утечка Tauri-listener'ов** — `src/hooks/useScriptData.ts:234`
  `listen()` на 3 события (`script-tags-changed`, `script-status-changed`, `script-hub-changed`) с пустым deps и неправильной работой с `mounted`. При ремонтах старые подписки остаются активны.

- **Stale closure в `useScriptData`** — `useScriptData.ts:104`
  `eslint-disable` на deps array, `onTagsLoaded` пропущен.

- **Risk бесконечного цикла** — `src/hooks/useScriptKeyboard.ts:49`
  useEffect → store update → пересборка tree → новый эффект.

- **Stale closures в Vim hotkeys** — `src/hooks/useVimHotkeys.tsx:307, 623`
  `visibleItems` используется внутри `useCallback`, но не в deps.

---

## 🟡 Архитектурный долг

- **`App.tsx` ~971 строка — God Component**
  15+ useState, resize/drag/install/orphan-логика вперемешку с UI.
  Разделить на: `EverythingInstaller`, `OrphanReconciler`, `WindowResizer`.

- **`src-tauri/src/lib.rs` ~2164 строки**
  44 `#[tauri::command]` + 500-строчный `native_popup` на GDI+ в одном файле.
  Распилить на `commands/{scripts,tags,system,popup}.rs` + `native_popup/mod.rs`.

- **IPC-слой дырявый**
  - `src/api.ts` покрывает только ~8 команд, ещё 16+ команд вызываются `invoke()` напрямую из 40+ мест (`App.tsx:573,575,622,623,629,630,636,657,937`, `ContextMenu.tsx:112-119`, `useScriptActions.ts:97,120,138,174,183,192`, `ScriptDetailPanel.tsx:165-195`).
  - Команды без обёртки: `set_script_hub`, `add_script_tag`, `remove_script_tag`, `save_tag_order`, `edit_script`, `open_in_explorer`, `open_with`, `delete_tag`, `restart_script`, `save_tag_icon`, `rename_tag`, `resolve_orphan`, `toggle_hide_folder`, `set_scan_paths`, `set_scan_blacklist`, `set_tray_settings`.
  - Типы не синхронизированы: `OrphanedScript` в Rust (`lib.rs:1878`) ≠ `PendingMatch` в TS (`OrphanReconcileDialog.tsx:6`).
  - `data: any` в `App.tsx:191`, `useTreeStore.ts:65`, `ContextMenu.tsx:13`.

- **Zustand-стор раздут (`useTreeStore`)**
  ~40 полей: UI + persistence + drag + vim + search в одном месте. Компоненты подписываются на весь стор → лишние ререндеры.
  Разделить: `UIStore`, `PersistenceStore`, `SearchStore`.

- **Prop drilling в `ScriptRow` (57+ props)**
  Обходится через модульный `setTreeCallbacks()` — `src/components/scripts/TreeNodeRenderer.tsx:33-34`. Хрупкий костыль вокруг `React.memo`. Нужен `TreeContext`.

- **Дублирование `HubScriptCard` vs `ScriptRow`** — одинаковый рендер для drag/pending/tags в двух копиях.

- **Хуки без иерархии** — 20+ хуков, цепь `useScriptTree → useNavigation → useTreeStore` должна быть одним контекстом.

- **`useNavigation.ts:14-89`** — физика (momentum, impulse) внутри navigation state, side-effect вне `useEffect` (`physics.pendingImpulseRef.current += kick`).

---

## 🟠 Производительность

- **Списки не виртуализированы** — `src/components/scripts/ScriptTree.tsx:348` рендерит весь массив. `TagPickerPopover.tsx:118-138` тоже без virtualization (max-h-52, может быть 100+ тегов).

- **`ScriptRow.memo` неоптимален** — custom comparator в `ScriptRow.tsx:264-281` сравнивает массивы через `.join()` на каждый ререндер.

- **`Cargo.toml` без `[profile.release]`** — нет `lto = true`, `opt-level = 3`, `codegen-units = 1`, `strip = true`. Релизный бинарь жирнее и медленнее, чем мог бы быть.

- **Лишние перевычисления** — `useScriptFilter.ts:159, 263` зависит от ~9 значений из стора без `useShallow`.

- **`newTagsSet` в каждом render** — `ScriptRow.tsx:33`.

- **Дублирование процесс-поиска в Rust** — `get_running_ahk_paths` (lib.rs:584), `collect_running_scripts` (639), `show_script_ui` (1316) — одна логика трижды.

---

## 🟢 Косметика

### A11y

- Нет ARIA-ролей и labels — `ScriptRow.tsx:108-128`, `ContextMenu.tsx:44-57`.
- `tabIndex` отсутствует на интерактивных элементах.
- TagPickerPopover не имеет ESC-fallback.

### Стили

- **Дубли длинных классов** — `src/components/detail/ScriptDetailPanel.tsx:248-308` (5 кнопок одинаковой формой). Извлечь в `@apply` или компонент `ActionIconButton`.
- **Хардкод hex** — `#71717a`, `#666`, `#aaa` в Button, IconButton, HubScriptCard, ScriptRow в обход токенов.
- **Дубли теней** — `rgba(79,70,229,0.6)` в `index.css:230-252` и в `Sidebar.tsx:301`, `CheatSheet.tsx:52`.
- **Нет светлой темы** — `useTheme.ts` считает только dark, нет `@media (prefers-color-scheme: light)`.
- **Нестандартные `px-[13px]`** — `Sidebar.tsx:330, 357`.
- **Inline-стили в hot path** — `ScriptRow.tsx:87-89` (opacity/border вычисляются каждый render).

### i18n

- **Захардкоженные fallback-и** в `t("key", "Русский текст")`:
  - `ContextMenu.tsx`: `context.remove_from_hub`, `context.add_to_hub`, `toast.removed_from_hub`, `toast.added_to_hub`, `toast.path_copied`.
  - `SettingsPanel.tsx`: `settings.add_hidden_folder`.
  - `App.tsx`: `sidebar.phase_reconciling`, `sidebar.phase_loading_meta`, `sidebar.phase_enriching`.
- **Отсутствующий namespace `toast.*`** в обоих `src/locales/{en,ru}.json`.

### Конфиги

- **Нет ESLint/Prettier**.
- **`patch-package` в devDeps** — что-то правится мимо апстрима, красный флаг.
- **`jsdom` лишний** — используется happy-dom.
- **`@ts-expect-error` в `vite.config`** — хак вместо `declare`.

### Hooks (мелочь)

- `useTheme.ts:32-45` — три отдельных `useEffect` для одной задачи (DOM-write).
- `useScanPaths.ts:12` — `invoke` без try-catch.
- `useTagOverflow.ts:82-83` — `eslint-disable` без объяснения.
- `useScriptData.ts:36-94` — `fetchData` нарушает SRP (fetch + cache + merge + scan duration + errors).

### Прочее

- **PowerShell вместо WinAPI** — `show_script_ui` (`lib.rs:1310-1376`) использует 30+ строк C# inline в PS для одного `PostMessage`. Заменить на `windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW`.
- **Жёсткий `sleep(150)` в `restart_script`** — `lib.rs:1300`.
- **`String::from_utf16_lossy`** молча заменяет невалидные последовательности — `lib.rs:1427-1437`.
- **Длинные функции** — `get_scripts` (~260 строк), `wndproc` (~200 строк switch).
- **Обработка ошибок IPC** — `App.tsx:657, 937`, `SettingsPanel.tsx:87` вызывают `invoke()` без `await`/`catch`. `TagIconPicker.tsx:176` — `.catch(() => {})` глотает ошибки.

---

## Приоритет рефакторинга

1. **[High]** Path injection в `edit_script` / `open_url` — полчаса работы.
2. **[High]** CSP + devtools=false в production.
3. **[High]** Cleanup listener'ов в `useScriptData`, не игнорировать ошибки `taskkill`.
4. **[High]** `[profile.release]` в `Cargo.toml`.
5. **[Med]** Распил `App.tsx` и `lib.rs` по модулям.
6. **[Med]** Единый типизированный `api.ts`, codegen Rust→TS типов.
7. **[Med]** Виртуализация `ScriptTree`, разделение Zustand-стора.
8. **[Low]** ESLint/Prettier, токены вместо хардкода, светлая тема, недостающие i18n-ключи.
