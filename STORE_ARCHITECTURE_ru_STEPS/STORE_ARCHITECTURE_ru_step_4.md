# Этап 4 — Tracking установленных + удаление + хеши

## Цель

Приложение запоминает что установлено из магазина и переживает перезапуск. Появляется кнопка Uninstall. Файлы проверяются по SHA-256 хешу для защиты от повреждения и подмены.

После этого этапа жизненный цикл install/uninstall полностью замкнут.

## Что должно работать в конце этапа

- После установки скрипта и перезапуска приложения кнопка остаётся в состоянии "✓ Installed"
- Кнопка "✓ Installed" раскрывается в dropdown с действиями: Run, Uninstall (опционально Open in Editor, Show in Folder)
- Uninstall удаляет файл с диска и убирает из БД
- При установке считается SHA-256 файла, сравнивается с хешем из catalog.json (если указан)
- Если хеш не совпал → установка отменяется, файл удаляется, ошибка пользователю
- При запуске приложения marketplace-таблица из БД восстанавливает состояние установленных
- В деталке скрипта в основном дереве (`ScriptDetailPanel`) появляется бейджик "From Store" если скрипт пришёл из магазина

## Что НЕ делаем на этом этапе

- Нет обновлений скриптов (этап 7)
- Нет детальной страницы магазина (этап 5)
- Нет проверки orphans (если пользователь удалил файл вручную) — это в этап 4.5 если понадобится
- Нет автообновления каталога с GitHub — только при запуске app

## Расширение `catalog.json`

Добавляем опциональное поле `sha256` для каждого скрипта:

```json
{
  "id": "window-snapper",
  "name": "Window Snapper",
  ...
  "entryFile": "window-snapper.ahk",
  "sha256": "a3f5c8b2..." 
}
```

Хеш считается от содержимого `entryFile`. Если поле отсутствует — пропускаем проверку (для обратной совместимости).

**Как считать хеш для своих скриптов:** одной командой в PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\scripts\window-snapper\window-snapper.ahk
```

В будущем CI на GitHub Actions будет делать это автоматически (этап после Этапа 8).

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  db.rs                             ← новая таблица marketplace_scripts + функции
  marketplace.rs                    ← хеш-проверка, uninstall, get_installed

tauri_app/src/
  api.ts                            ← uninstallMarketplaceScript, getInstalledMarketplace
  store/useMarketplaceStore.ts      ← загрузка установленных при mount
  components/marketplace/
    CatalogCard.tsx                 ← dropdown для Installed
    InstalledDropdown.tsx           ← компонент dropdown
  components/
    ScriptDetailPanel.tsx           ← бейдж "From Store"
```

## База данных

### Новая таблица в `db.rs`

В функции `create_schema` (или эквивалентной) добавить:

```sql
CREATE TABLE IF NOT EXISTS marketplace_scripts (
    marketplace_id    TEXT PRIMARY KEY,
    install_path      TEXT NOT NULL,
    entry_file        TEXT NOT NULL,
    version           TEXT NOT NULL DEFAULT '1.0.0',
    content_hash      TEXT NOT NULL,
    installed_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_path ON marketplace_scripts(install_path);
```

### Функции в `db.rs`

```rust
pub fn marketplace_install_record(
    conn: &Connection,
    marketplace_id: &str,
    install_path: &str,
    entry_file: &str,
    version: &str,
    content_hash: &str,
) -> Result<(), rusqlite::Error> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO marketplace_scripts (marketplace_id, install_path, entry_file, version, content_hash, installed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(marketplace_id) DO UPDATE SET
            install_path = ?2,
            entry_file = ?3,
            version = ?4,
            content_hash = ?5,
            installed_at = ?6",
        rusqlite::params![marketplace_id, install_path, entry_file, version, content_hash, now],
    )?;
    Ok(())
}

pub fn marketplace_uninstall_record(
    conn: &Connection,
    marketplace_id: &str,
) -> Result<Option<String>, rusqlite::Error> {
    // Возвращает install_path удалённой записи (для удаления файла)
    let path: Option<String> = conn.query_row(
        "SELECT install_path FROM marketplace_scripts WHERE marketplace_id = ?1",
        rusqlite::params![marketplace_id],
        |row| row.get(0),
    ).optional()?;

    if path.is_some() {
        conn.execute(
            "DELETE FROM marketplace_scripts WHERE marketplace_id = ?1",
            rusqlite::params![marketplace_id],
        )?;
    }
    Ok(path)
}

#[derive(Serialize, Clone)]
pub struct InstalledMarketplaceScript {
    pub marketplace_id: String,
    pub install_path: String,
    pub version: String,
    pub installed_at: String,
}

pub fn marketplace_get_all_installed(
    conn: &Connection,
) -> Result<Vec<InstalledMarketplaceScript>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT marketplace_id, install_path, version, installed_at FROM marketplace_scripts"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(InstalledMarketplaceScript {
            marketplace_id: row.get(0)?,
            install_path: row.get(1)?,
            version: row.get(2)?,
            installed_at: row.get(3)?,
        })
    })?;
    rows.collect()
}
```

## Rust backend (`marketplace.rs`)

### Обновляем `marketplace_install_script`

Добавляем хеш-проверку и запись в БД:

```rust
use sha2::{Sha256, Digest};

#[tauri::command]
pub async fn marketplace_install_script(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
    script_id: String,
    entry_file: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    // 1. Скачать (как раньше)
    let url = format!("{}/scripts/{}/{}", RAW_BASE, script_id, entry_file);
    let bytes = download_file(&url).await?;

    // 2. Проверить хеш
    let actual_hash = format!("{:x}", Sha256::digest(&bytes));
    if let Some(expected) = expected_sha256 {
        if actual_hash != expected {
            return Err(format!(
                "Hash mismatch! Expected {}, got {}. File may be corrupted or tampered.",
                expected, actual_hash
            ));
        }
    }

    // 3. Определить путь установки (как раньше)
    let install_dir = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let scan_paths = crate::db::get_scan_paths(&conn);
        let first = scan_paths.first().ok_or("No scan paths configured")?.clone();
        PathBuf::from(first).join("marketplace").join(&script_id)
    };
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;

    // 4. Атомарная запись
    let target = install_dir.join(&entry_file);
    let temp = install_dir.join(format!(".tmp_{}", uuid::Uuid::new_v4()));
    std::fs::write(&temp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &target).map_err(|e| e.to_string())?;

    // 5. Записать в БД
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        crate::db::marketplace_install_record(
            &conn,
            &script_id,
            &target.to_string_lossy(),
            &entry_file,
            "1.0.0",  // версия пока заглушка, в этапе 7 будет реальная
            &actual_hash,
        ).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("marketplace-script-installed", &script_id);
    Ok(target.to_string_lossy().to_string())
}
```

### Новая команда `marketplace_uninstall_script`

```rust
#[tauri::command]
pub async fn marketplace_uninstall_script(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
    script_id: String,
) -> Result<(), String> {
    let install_path = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        crate::db::marketplace_uninstall_record(&conn, &script_id)
            .map_err(|e| e.to_string())?
    };

    if let Some(path) = install_path {
        let path_buf = PathBuf::from(&path);

        // Попытаться удалить файл
        let _ = std::fs::remove_file(&path_buf);

        // Удалить пустую родительскую папку (marketplace/<id>/)
        if let Some(parent) = path_buf.parent() {
            let _ = std::fs::remove_dir(parent);
        }
    }

    let _ = app.emit("marketplace-script-uninstalled", &script_id);
    Ok(())
}
```

### Команда `marketplace_get_installed`

```rust
#[tauri::command]
pub async fn marketplace_get_installed(
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<Vec<crate::db::InstalledMarketplaceScript>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    crate::db::marketplace_get_all_installed(&conn).map_err(|e| e.to_string())
}
```

Регистрируем все три команды в `lib.rs`.

## Frontend

### `useMarketplaceStore.ts` — загрузка состояния

```typescript
interface MarketplaceStore {
  // ...
  installedIds: Set<string>;
  hasLoadedInstalled: boolean;

  loadInstalled: () => Promise<void>;
  installScript: (script: CatalogScript) => Promise<void>;
  uninstallScript: (scriptId: string) => Promise<void>;
}

loadInstalled: async () => {
  if (get().hasLoadedInstalled) return;
  try {
    const list = await getInstalledMarketplace();
    set({
      installedIds: new Set(list.map(s => s.marketplace_id)),
      hasLoadedInstalled: true,
    });
  } catch (e) {
    console.error("Failed to load installed:", e);
  }
},

uninstallScript: async (scriptId) => {
  try {
    await uninstallMarketplaceScript(scriptId);
    set(state => {
      const next = new Set(state.installedIds);
      next.delete(scriptId);
      return { installedIds: next };
    });
    toast.success("Удалено");
  } catch (e) {
    toast.error(`Ошибка удаления: ${e}`);
  }
},
```

В `installScript` теперь передаём `expected_sha256` из catalog.

В `MarketplaceView.tsx` при mount вызываем `loadInstalled()` параллельно с `fetchCatalog()`.

### `InstalledDropdown.tsx`

```tsx
export function InstalledDropdown({ scriptId, scriptName }: Props) {
  const [open, setOpen] = useState(false);
  const uninstall = useMarketplaceStore(s => s.uninstallScript);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2 rounded-lg bg-white/8 text-white/70 border border-white/10
                   hover:bg-white/12 flex items-center gap-1"
      >
        ✓ Installed <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg
                        bg-zinc-900/95 backdrop-blur-xl border border-white/10
                        shadow-xl overflow-hidden z-50">
          <button
            onClick={() => { uninstall(scriptId); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-red-300
                       hover:bg-red-500/20 flex items-center gap-2"
          >
            <Trash size={14} /> Uninstall
          </button>
        </div>
      )}
    </div>
  );
}
```

Закрытие по клику вне — стандартный паттерн (`useEffect` на `mousedown` document, как уже сделано в context-менюшках проекта).

### Обновлённая `CatalogCard.tsx`

```tsx
const isInstalled = useMarketplaceStore(s => s.installedIds.has(script.id));

// В кнопочной части:
{isInstalling
  ? <SpinnerButton />
  : isInstalled
    ? <InstalledDropdown scriptId={script.id} scriptName={script.name} />
    : <InstallButton onClick={() => installScript(script)} />
}
```

### Бейдж "From Store" в `ScriptDetailPanel.tsx`

В деталке скрипта (правая панель) добавляем индикатор если путь скрипта совпадает с установленным из marketplace:

```tsx
const installedPaths = useMarketplaceStore(s => s.installedIds); // нужен будет Map id→path
const isFromStore = checkIsFromStore(script.path, installedPaths);

{isFromStore && (
  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                  bg-indigo-500/20 text-indigo-300 text-xs">
    <ShoppingBag size={12} /> From Store
  </div>
)}
```

Для этого в Zustand store храним `Map<id, install_path>` а не просто `Set<id>`.

## Тестирование

1. Положить несколько скриптов на GitHub с правильными `sha256` в catalog.json
2. Запустить app
3. Установить скрипт → видно "✓ Installed"
4. Закрыть app
5. Снова открыть → перейти в Store → кнопка всё ещё "✓ Installed" (восстановилось из БД)
6. Кликнуть на dropdown → выбрать Uninstall
7. Файл удалился (проверить в проводнике), кнопка снова "Install"
8. **Тест хеша:** изменить файл на GitHub без обновления `sha256` → попытка установки → ошибка hash mismatch, файл не создан
9. Тест "From Store": открыть деталку установленного скрипта → виден бейдж
10. Тест уволенного через основное дерево: удалить файл скрипта вручную через основной интерфейс → marketplace должен корректно отреагировать (на этапе 4.5 если нужно — пока можно просто рассинхрон без падения)

## Что делает этот этап ценным сам по себе

После этого этапа магазин готов **к ежедневному использованию**. Установить, использовать, удалить — полный цикл. Хеш-проверка защищает от подмены. Состояние переживает перезапуски. С точки зрения пользователя — это полноценный пакетный менеджер. Дальше идут улучшения UX (детальная страница, поиск, обновления), но базовый продукт уже работает.
