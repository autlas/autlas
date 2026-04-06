# Аудит надёжности AHK Manager

**Дата:** 2026-04-06
**Метод:** 4 параллельных агента (backend, frontend, IPC contract, test coverage)

---

## CRITICAL

### 1. PowerShell injection через path скрипта
- **Файл:** `src-tauri/src/lib.rs:~1821`
- **Проблема:** Путь скрипта передаётся в PowerShell-команду без экранирования. Если имя файла содержит `'; Write-Host 'pwned'; #`, это выполнится как произвольный код.
- **Fix:** Экранировать одинарные кавычки (`'` → `''`) или использовать Win32 API напрямую вместо PowerShell.

### 2. Deadlock: вложенные Mutex в tray callback
- **Файл:** `src-tauri/src/lib.rs:~1775-1830`
- **Проблема:** Tray callback берёт `PopupState` mutex, затем `DbState` mutex. Если другой код берёт их в обратном порядке — circular wait → зависание приложения.
- **Fix:** Не держать оба mutex одновременно. Скопировать данные из PopupState, отпустить его, затем брать DbState.

### 3. Race condition: get_scripts + watcher
- **Файл:** `src-tauri/src/lib.rs:~1002-1089`
- **Проблема:** `get_scripts()` отпускает и повторно берёт `DbState` mutex между фазами (scan → reconcile → build response). Фоновый watcher может вклиниться и изменить данные между этими фазами.
- **Fix:** Держать lock на всю длительность reconciliation, или использовать транзакции SQLite для консистентности.

### 4. Unwrap panics в db.rs
- **Файл:** `src-tauri/src/db.rs:~279, 318, 346, 374, 501, 529`
- **Проблема:** `.unwrap()` на `prepare()` вызовах. Если БД повреждена или заблокирована — паника и краш бэкенд-потока.
- **Fix:** Заменить на `?` с propagation ошибки наверх.

### 5. Утечка event listeners при быстром unmount
- **Файл:** `src/hooks/useScriptTree.ts:~186-225`
- **Проблема:** `listen()` вызывается асинхронно через `.then()`, но cleanup возвращается синхронно. Если компонент размонтируется до завершения `listen()` — listeners зарегистрируются в пустоту и никогда не будут удалены.
- **Fix:** Использовать AbortController или флаг `isMounted` для отмены регистрации после unmount.

---

## HIGH

### 6. Watcher thread без shutdown signal
- **Файл:** `src-tauri/src/lib.rs:~640-689`
- **Проблема:** `loop {}` без условия выхода. При закрытии приложения поток продолжает работать (zombie). Может держать lock на DB файл, мешая следующему запуску.
- **Fix:** `AtomicBool` флаг + проверка в цикле. Сигнал при `app.on_exit()`.

### 7. Нет транзакции в dedup_scripts_by_path
- **Файл:** `src-tauri/src/db.rs:~42-96`
- **Проблема:** Множественные DELETE (tags, scripts) выполняются без обёртки в транзакцию. Если второй DELETE упадёт — tags останутся orphaned (нарушение FK).
- **Fix:** Обернуть в `conn.transaction()`.

### 8. Path normalization inconsistency
- **Файлы:** `db.rs:~55-57, 206-207` vs `lib.rs:~1043-1053`
- **Проблема:** 3 разных алгоритма нормализации путей в разных местах кода. Могут давать разные результаты для одного и того же пути (особенно `\\?\`, `/` vs `\`).
- **Fix:** Единая функция `normalize_path()`, используемая везде.

### 9. Silent failures в fetchData
- **Файл:** `src/hooks/useScriptTree.ts:~115-117`
- **Проблема:** `catch (e) { }` — все ошибки загрузки данных подавляются молча. Пользователь не знает что данные устарели.
- **Fix:** Логировать ошибки, показывать toast/notification, добавить retry logic.

### 10. Merge OR-logic для is_running
- **Файл:** `src/hooks/useScriptTree.ts:~105`
- **Проблема:** `p.is_running || d.is_running` — после kill скрипта, если scan вернёт `is_running: false`, но prev state был `true`, merge сохранит `true`. Скрипт "залипает" как running.
- **Fix:** Использовать данные из scan как source of truth для is_running, или добавить timestamp для определения приоритета.

### 11. Hash collision в reconciliation
- **Файл:** `src-tauri/src/reconcile.rs:~85-111`
- **Проблема:** Когда 2+ orphan имеют одинаковый content hash — код берёт первый, остальные orphan навсегда. Нет tie-breaking или очереди на подтверждение.
- **Fix:** При множественных hash-совпадениях отправлять ВСЕ в очередь на подтверждение пользователем (PendingMatch).

---

## MEDIUM

### 12. Prefix match для hidden folders
- **Файл:** `src-tauri/src/lib.rs:~1106`
- **Проблема:** `path_lower.contains(&h.to_lowercase())` — hide `c:\test` скрывает и `c:\test2\file.ahk` (prefix match).
- **Fix:** Проверять `starts_with(folder + "\\")` вместо `contains`.

### 13. folderRefs Map растёт без ограничений
- **Файл:** `src/hooks/useScriptTree.ts:~64`
- **Проблема:** `Map<string, HTMLDivElement>` никогда не очищается. Длительная сессия с большим деревом = memory leak.
- **Fix:** Очищать при unmount или использовать WeakRef.

### 14. startBurst interval leak при unmount
- **Файл:** `src/hooks/useScriptTree.ts:~292-315`
- **Проблема:** Если компонент размонтируется во время burst polling — setInterval продолжает вызывать invoke на несуществующий компонент.
- **Fix:** Хранить interval ID в ref, очищать в cleanup useEffect.

### 15. localStorage без обработки QuotaExceeded
- **Файлы:** useTheme.ts, useNavigation.ts, ScriptTree.tsx и др. (30+ вызовов)
- **Проблема:** `localStorage.setItem()` без try-catch. Переполнение квоты = необработанное исключение.
- **Fix:** Обернуть все setItem в try-catch с fallback.

### 16. Error messages экспозят системные детали
- **Файл:** `src-tauri/src/lib.rs` (повсеместно)
- **Проблема:** `.map_err(|e| e.to_string())` отдаёт внутренние пути, registry paths, environment info во фронтенд.
- **Fix:** Логировать полную ошибку в stderr, возвращать generic message.

### 17. Symlink/junction — tag orphaning
- **Файл:** `src-tauri/src/lib.rs:~1043-1050`
- **Проблема:** `canonicalize()` резолвит symlinks. Если пользователь ожидает tag на symlink — tag привязан к resolved path. Удаление symlink = orphan.
- **Fix:** Документировать поведение или трекать оба пути.

### 18. Нет вызова cleanup_old_orphans
- **Файл:** `src-tauri/src/db.rs:~364-369`
- **Проблема:** Функция `cleanup_old_orphans_sql()` определена но помечена `#[allow(dead_code)]` и нигде не вызывается. Orphans накапливаются в БД бесконечно.
- **Fix:** Вызывать в конце `reconcile()`.

### 19. Unbounded icon cache
- **Файл:** `src-tauri/src/lib.rs:~1505-1564`
- **Проблема:** `icon_svg_cache` растёт без ограничений. Нет eviction policy.
- **Fix:** Ограничить размер кэша (5000 записей), LRU eviction.

---

## LOW

### 20. scan_paths без валидации
- **Файл:** `src-tauri/src/lib.rs:~1652-1658`
- **Проблема:** `set_scan_paths()` принимает произвольные пути без проверки существования, прав доступа, is_dir.

### 21. UI detection неполная (AHK v2)
- **Файл:** `src-tauri/src/lib.rs:~1109-1114`
- **Проблема:** Ищет только `0x0401`/`0x401`. AHK v2 использует `GuiCreate`, `Gui.Show` — не детектируются.

### 22. Everything.exe error handling
- **Файл:** `src-tauri/src/lib.rs:~940-977`
- **Проблема:** `scan_with_everything()` не различает "не установлен" и "ошибка выполнения". Возвращает `None` для обоих.

### 23. MAX_PATH не валидируется
- **Проблема:** Пути > 260 символов могут не работать на старых системах (до Win10 1607). Нет проверки.

### 24. localStorage key naming inconsistency
- **Проблема:** Разные префиксы (`app-brightness`, `ahk_active_tab`, `ahk-vim-mode`). Нет единого enum для ключей.

---

## Тестовое покрытие

### Текущее состояние (126 frontend + 33 backend = 159 тестов)

| Категория | Покрытие | Статус |
|-----------|----------|--------|
| Hook unit тесты | 126 тестов | Хорошо, но ~80-100 edge cases не покрыты |
| Zustand store | 65 тестов | Полное покрытие всех slices |
| API layer | 20 тестов | Полное покрытие |
| Event system | 6 тестов | Базовое покрытие |
| **Component тесты** | **0** | Не покрыто |
| **Drag & drop** | **0** | Не покрыто |
| **Error recovery** | **~5%** | Почти не покрыто |
| **Concurrent ops** | **0** | Не покрыто |

### Приоритетные тесты для написания

1. **ScriptRow.tsx** (~60 тестов) — tag overflow, ResizeObserver, drag, vim focus, pending states
2. **useScriptTree.ts advanced** (~40 тестов) — drag flow, startBurst polling, merge edge cases, folder compaction
3. **ScriptTree.tsx** (~50 тестов) — tree rendering, expand/collapse, keyboard nav
4. **Error scenarios** (~30 тестов) — invoke rejection, retry, rollback
5. **Concurrent operations** (~20 тестов) — rapid clicks, race conditions
6. **localStorage resilience** (~25 тестов) — quota exceeded, corrupted JSON, missing keys

### Непокрытые edge cases в существующих тестах

- Пустой список скриптов (0 scripts)
- Очень длинные пути (260+ chars)
- Unicode в именах файлов и тегов
- 50+ тегов на одном скрипте
- 100 уровней вложенности папок
- Concurrent removeTag на одном скрипте
- fetchData error → loading state
- Orphaned focusedPath (скрипт удалён)
- moveFocus в grid layout (cols > 1)

---

## IPC контракт

### Подтверждённые расхождения

| Frontend | Backend | Риск |
|----------|---------|------|
| `has_ui?: boolean` (optional) | `has_ui: bool` (required) | Низкий — serde default false |
| `catch(() => {})` на tag_icons | Может вернуть ошибку | Средний — silent failure |
| Event listener async registration | Events могут прийти сразу | Средний — потеря первых событий |

### Подтверждённо корректное

- `forceScan` ↔ `force_scan` — Tauri 2 автоматически конвертирует camelCase ↔ snake_case
- `run_script` через `explorer` — корректно, Windows открывает .ahk ассоциированным приложением (AutoHotkey)
- `Script` struct поля совпадают между TS и Rust (с учётом авто-rename)

---

## Приоритет исправлений

### День 1 (CRITICAL)
- [ ] PowerShell injection — экранирование путей
- [ ] Deadlock в tray callback — разделить mutex acquisition
- [ ] Unwrap panics в db.rs — заменить на `?`

### Неделя 1 (HIGH)
- [ ] Watcher shutdown signal
- [ ] Транзакция в dedup
- [ ] Единая normalize_path()
- [ ] fetchData error handling
- [ ] Merge is_running logic fix

### Неделя 2 (MEDIUM)
- [ ] Hidden folder prefix match fix
- [ ] startBurst interval cleanup
- [ ] Event listener leak fix
- [ ] localStorage try-catch wrapper
- [ ] Вызов cleanup_old_orphans
