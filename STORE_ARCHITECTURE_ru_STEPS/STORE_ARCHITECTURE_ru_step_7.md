# Этап 7 — Обновления установленных скриптов

## Цель

Если автор обновил скрипт в репозитории — пользователь видит уведомление и может обновить в один клик. Старая версия сохраняется в backup для отката.

С этого момента магазин превращается из "разовой раздачи файлов" в **настоящий пакетный менеджер**.

## Что должно работать в конце этапа

- В catalog.json у каждого скрипта есть поле `version` (semver)
- При запуске приложения сравниваются установленные версии vs версии в каталоге
- Если есть обновления → бейдж на табе Store: "Store (3)"
- В Store появляется секция "Updates Available" наверху списка
- Для каждого обновляемого скрипта — кнопка "Update" + индикатор `1.2.0 → 1.3.0`
- Кнопка "Update All" обновляет все доступные одним кликом
- В детальной странице установленного скрипта — кнопка "Update available"
- Перед обновлением старая версия сохраняется в `<install_path>.bak`
- После обновления — toast с changelog (если указан)
- Если скрипт был запущен — он останавливается, обновляется, перезапускается
- Кнопка "Rollback" в dropdown установленного скрипта (восстанавливает .bak)

## Что НЕ делаем на этом этапе

- Нет автообновлений в фоне (пользователь сам решает когда)
- Нет уведомлений между сессиями (только при запуске app)
- Нет diff-view между версиями
- Нет breaking changes warnings (это в этап 8 если будет нужно)
- Нет авто-перепроверки каталога каждые N часов — только при запуске

## Расширение `catalog.json` и `manifest.json`

### `catalog.json`

```json
{
  "id": "window-snapper",
  ...
  "version": "1.3.0",
  "updatedAt": "2026-04-10T10:00:00Z"
}
```

### `manifest.json` скрипта

```json
{
  "id": "window-snapper",
  "version": "1.3.0",
  "changelog": "Добавлена поддержка multi-monitor конфигурации"
}
```

`changelog` — короткая строка про текущую версию. Её мы покажем после обновления.

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  marketplace.rs                    ← marketplace_check_updates,
                                      marketplace_update_script,
                                      marketplace_rollback_script
  db.rs                             ← обновление marketplace_install_record
                                      (поля prev_version, prev_content_hash)

tauri_app/src/
  api.ts                            ← новые wrappers
  store/useMarketplaceStore.ts      ← updates state, checkUpdates action
  components/marketplace/
    StoreBrowse.tsx                 ← секция Updates Available наверху
    UpdatesSection.tsx              ← новый компонент
    InstalledDropdown.tsx           ← пункт Rollback
    CatalogCard.tsx                 ← кнопка Update вместо Install
  components/Sidebar.tsx            ← badge на табе Store
```

## База данных

В таблице `marketplace_scripts` уже есть колонки. Дополняем для отката:

```sql
-- Если делаем миграцию через ALTER:
ALTER TABLE marketplace_scripts ADD COLUMN prev_version TEXT;
ALTER TABLE marketplace_scripts ADD COLUMN prev_content_hash TEXT;
ALTER TABLE marketplace_scripts ADD COLUMN updated_at TEXT;
```

При первой миграции — обернуть в `let _ =` чтобы игнорировать ошибки "duplicate column" если запускается повторно.

## Rust backend

### `marketplace_check_updates`

```rust
#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub script_id: String,
    pub script_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub changelog: Option<String>,
    pub entry_file: String,
}

#[tauri::command]
pub async fn marketplace_check_updates(
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<Vec<UpdateInfo>, String> {
    // 1. Скачать каталог (или использовать кешированный)
    let catalog = marketplace_get_catalog().await?;

    // 2. Получить установленные из БД
    let installed = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        crate::db::marketplace_get_all_installed(&conn).map_err(|e| e.to_string())?
    };

    // 3. Сравнить версии
    let mut updates = Vec::new();
    for inst in installed {
        if let Some(catalog_entry) = catalog.scripts.iter().find(|s| s.id == inst.marketplace_id) {
            if catalog_entry.version != inst.version {
                updates.push(UpdateInfo {
                    script_id: inst.marketplace_id.clone(),
                    script_name: catalog_entry.name.clone(),
                    current_version: inst.version.clone(),
                    latest_version: catalog_entry.version.clone(),
                    changelog: None, // подгрузим из manifest при необходимости
                    entry_file: catalog_entry.entry_file.clone(),
                });
            }
        }
    }

    Ok(updates)
}
```

### `marketplace_update_script`

```rust
#[tauri::command]
pub async fn marketplace_update_script(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
    script_id: String,
    entry_file: String,
    expected_sha256: Option<String>,
    new_version: String,
) -> Result<UpdateResult, String> {
    // 1. Получить путь установленного скрипта
    let (install_path, was_running, prev_version, prev_hash) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let installed = crate::db::marketplace_get_all_installed(&conn)
            .map_err(|e| e.to_string())?;
        let entry = installed.iter().find(|s| s.marketplace_id == script_id)
            .ok_or("Script not installed")?;
        (entry.install_path.clone(), false, entry.version.clone(), entry.content_hash.clone())
    };

    // 2. Проверить запущен ли скрипт (используем существующий механизм)
    let was_running = check_script_running(&install_path);
    if was_running {
        // Используем существующую функцию kill_script
        let _ = kill_script_internal(&install_path);
    }

    // 3. Скачать новую версию
    let url = format!("{}/scripts/{}/{}", RAW_BASE, script_id, entry_file);
    let bytes = download_file(&url).await?;

    // 4. Проверить хеш
    let new_hash = format!("{:x}", Sha256::digest(&bytes));
    if let Some(expected) = expected_sha256 {
        if new_hash != expected {
            // Если был запущен — перезапустить старую версию обратно
            if was_running { let _ = run_script_internal(&install_path); }
            return Err("Hash mismatch".to_string());
        }
    }

    // 5. Backup старого файла
    let path = PathBuf::from(&install_path);
    let backup_path = path.with_extension("ahk.bak");
    if path.exists() {
        std::fs::copy(&path, &backup_path).map_err(|e| e.to_string())?;
    }

    // 6. Атомарная запись новой версии
    let temp = path.with_extension(format!("ahk.tmp_{}", uuid::Uuid::new_v4()));
    std::fs::write(&temp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &path).map_err(|e| {
        // Откат при ошибке
        if backup_path.exists() {
            let _ = std::fs::copy(&backup_path, &path);
        }
        e.to_string()
    })?;

    // 7. Обновить запись в БД (с сохранением prev_*)
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE marketplace_scripts
             SET version = ?1, content_hash = ?2,
                 prev_version = ?3, prev_content_hash = ?4,
                 updated_at = ?5
             WHERE marketplace_id = ?6",
            rusqlite::params![
                new_version, new_hash,
                prev_version, prev_hash,
                crate::db::now_iso(),
                script_id
            ],
        ).map_err(|e| e.to_string())?;
    }

    // 8. Перезапустить если был запущен
    if was_running {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = run_script_internal(&install_path);
    }

    let _ = app.emit("marketplace-script-updated", &script_id);

    Ok(UpdateResult {
        script_id,
        new_version,
        was_running,
    })
}
```

### `marketplace_rollback_script`

```rust
#[tauri::command]
pub async fn marketplace_rollback_script(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
    script_id: String,
) -> Result<(), String> {
    let install_path = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let installed = crate::db::marketplace_get_all_installed(&conn)
            .map_err(|e| e.to_string())?;
        installed.iter().find(|s| s.marketplace_id == script_id)
            .ok_or("Script not installed")?.install_path.clone()
    };

    let path = PathBuf::from(&install_path);
    let backup = path.with_extension("ahk.bak");

    if !backup.exists() {
        return Err("Нет резервной копии для отката".to_string());
    }

    // Останавливаем если запущен
    let was_running = check_script_running(&install_path);
    if was_running { let _ = kill_script_internal(&install_path); }

    // Заменяем
    std::fs::copy(&backup, &path).map_err(|e| e.to_string())?;
    std::fs::remove_file(&backup).ok();

    // Откатываем версию в БД
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE marketplace_scripts
             SET version = COALESCE(prev_version, version),
                 content_hash = COALESCE(prev_content_hash, content_hash),
                 prev_version = NULL,
                 prev_content_hash = NULL
             WHERE marketplace_id = ?1",
            rusqlite::params![script_id],
        ).map_err(|e| e.to_string())?;
    }

    if was_running {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = run_script_internal(&install_path);
    }

    let _ = app.emit("marketplace-script-rolled-back", &script_id);
    Ok(())
}
```

## Frontend

### Zustand store

```typescript
interface MarketplaceStore {
  // ...
  availableUpdates: UpdateInfo[];
  isCheckingUpdates: boolean;

  checkForUpdates: () => Promise<void>;
  updateScript: (info: UpdateInfo) => Promise<void>;
  updateAll: () => Promise<void>;
  rollbackScript: (scriptId: string) => Promise<void>;
}

checkForUpdates: async () => {
  set({ isCheckingUpdates: true });
  try {
    const updates = await checkMarketplaceUpdates();
    set({ availableUpdates: updates, isCheckingUpdates: false });
  } catch (e) {
    set({ isCheckingUpdates: false });
    console.error("Update check failed:", e);
  }
},

updateScript: async (info) => {
  try {
    const result = await updateMarketplaceScript(
      info.script_id,
      info.entry_file,
      undefined,  // sha256 из catalog
      info.latest_version,
    );
    // Убираем из списка доступных
    set(state => ({
      availableUpdates: state.availableUpdates.filter(u => u.script_id !== info.script_id),
    }));
    toast.success(
      `${info.script_name} обновлён до ${info.latest_version}` +
      (info.changelog ? `: ${info.changelog}` : "")
    );
  } catch (e) {
    toast.error(`Ошибка обновления: ${e}`);
  }
},
```

### Запуск проверки при mount

В `App.tsx` или в `MarketplaceView.tsx` после загрузки каталога:

```tsx
useEffect(() => {
  // 5 секунд после старта чтобы UI прогрузился
  const t = setTimeout(() => {
    useMarketplaceStore.getState().checkForUpdates();
  }, 5000);
  return () => clearTimeout(t);
}, []);
```

### Бейдж на табе Store в Sidebar

```tsx
const updateCount = useMarketplaceStore(s => s.availableUpdates.length);

<button className="...">
  <Storefront />
  <span>Store</span>
  {updateCount > 0 && (
    <span className="ml-auto px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-xs font-semibold">
      {updateCount}
    </span>
  )}
</button>
```

### `UpdatesSection.tsx`

```tsx
export function UpdatesSection() {
  const updates = useMarketplaceStore(s => s.availableUpdates);
  const updateScript = useMarketplaceStore(s => s.updateScript);
  const updateAll = useMarketplaceStore(s => s.updateAll);

  if (updates.length === 0) return null;

  return (
    <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-indigo-200">
          Доступно обновлений: {updates.length}
        </div>
        <button
          onClick={updateAll}
          className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium"
        >
          Обновить всё
        </button>
      </div>
      <div className="space-y-2">
        {updates.map(u => (
          <div key={u.script_id} className="flex items-center justify-between text-sm">
            <div>
              <span className="text-white/90 font-medium">{u.script_name}</span>
              <span className="text-white/40 ml-2">
                {u.current_version} → {u.latest_version}
              </span>
            </div>
            <button
              onClick={() => updateScript(u)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs"
            >
              Обновить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### `InstalledDropdown.tsx` — пункт Rollback

```tsx
{hasBackup && (
  <button onClick={() => rollback(scriptId)} className="...">
    <Reset size={14} /> Откатить версию
  </button>
)}
```

`hasBackup` определяется наличием prev_version в БД. Можно либо хранить отдельным флагом, либо проверять при загрузке installed.

## Тестирование

1. Установить скрипт в текущей версии 1.0.0
2. Изменить в репо: `version: "1.1.0"` в catalog.json и в manifest.json
3. Опционально изменить `.ahk` файл и пересчитать sha256
4. Пушнуть, перезапустить app
5. Через 5 секунд → бейдж "Store (1)" появляется в сайдбаре
6. Открыть Store → видна секция "Updates Available" наверху
7. Кликнуть Update → скрипт обновился, toast с подтверждением
8. Бейдж исчез, секция убралась
9. В dropdown установленного скрипта появился пункт "Откатить версию"
10. Клик откат → файл восстановлен, версия в БД 1.0.0
11. Тест с запущенным скриптом: запустить → обновить → должен корректно остановиться, обновиться, запуститься заново

## Что делает этот этап ценным сам по себе

Без обновлений магазин — это разовая раздача. С обновлениями — настоящая инфраструктура. Авторы могут публиковать улучшения, пользователи получают их в один клик. Откат защищает от регрессий. После этого этапа продукт функционально не уступает Obsidian Plugins или VS Code Extensions в своей нише.
