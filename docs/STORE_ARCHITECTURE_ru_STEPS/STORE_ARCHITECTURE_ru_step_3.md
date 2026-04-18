# Этап 3 — Установка скрипта в один клик

## Цель

Кнопка Install реально работает: качает `.ahk` файл с GitHub, кладёт в локальную папку, и скрипт появляется в основном дереве AHK Manager как обычный пользовательский скрипт. Можно его сразу запустить.

**Это первая по-настоящему рабочая итерация магазина.** После этого этапа уже не стыдно показать другу.

## Что должно работать в конце этапа

- Клик "Install" на карточке → скачивается `.ahk` файл с GitHub
- Файл сохраняется в `<первый_scan_path>/marketplace/<script-name>/<script-name>.ahk`
- После установки автоматически триггерится сканирование → новый скрипт появляется в основном дереве
- Можно перейти на таб "All" → найти установленный скрипт → запустить его (Run)
- Кнопка Install во время загрузки показывает спиннер
- После успешной установки кнопка меняется на "Installed ✓" (только в рамках текущей сессии — без БД)
- При ошибке загрузки — toast с ошибкой, кнопка возвращается в исходное состояние

## Что НЕ делаем на этом этапе

- Нет SQLite-таблицы для tracking установленных (это этап 4)
- После перезапуска приложения статус "Installed" сбрасывается — кнопка снова показывает "Install"
- Нет проверки SHA-256 хеша (добавим в этапе 4)
- Нет uninstall (этап 4)
- Нет multi-file скриптов с зависимостями — пока только один файл на скрипт
- Нет прогресс-бара скачивания (`.ahk` файлы маленькие, инстант)

## Подготовка GitHub-репозитория

### Расширяем структуру

```
ahk-manager-store/
  catalog.json
  scripts/
    window-snapper/
      window-snapper.ahk            ← реальный код скрипта
    clipboard-history/
      clipboard-history.ahk
    ...
```

### Реальные `.ahk` файлы

Положи реальные минимальные AHK v2 скрипты. Например, `window-snapper.ahk`:

```ahk
#Requires AutoHotkey v2.0

#!Left::WinMove(0, 0, A_ScreenWidth / 2, A_ScreenHeight, "A")
#!Right::WinMove(A_ScreenWidth / 2, 0, A_ScreenWidth / 2, A_ScreenHeight, "A")
#!Up::WinMove(0, 0, A_ScreenWidth, A_ScreenHeight / 2, "A")
#!Down::WinMove(0, A_ScreenHeight / 2, A_ScreenWidth, A_ScreenHeight / 2, "A")
```

### Расширяем `catalog.json`

Добавляем поле `entryFile` — путь к главному `.ahk` файлу относительно корня `scripts/<id>/`:

```json
{
  "version": 1,
  "updatedAt": "2026-04-07T00:00:00Z",
  "scripts": [
    {
      "id": "window-snapper",
      "name": "Window Snapper",
      "description": "Привязка окон к четвертям экрана горячими клавишами",
      "author": "alexkoz",
      "ahkVersion": "v2",
      "category": "productivity",
      "entryFile": "window-snapper.ahk"
    }
  ]
}
```

URL для скачивания файла собирается в Rust как:
```
https://raw.githubusercontent.com/<org>/<repo>/main/scripts/<id>/<entryFile>
```

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  marketplace.rs                    ← добавить marketplace_install_script

tauri_app/src/
  api.ts                            ← installMarketplaceScript wrapper
  store/useMarketplaceStore.ts      ← добавить installedIds Set, installScript action
  components/marketplace/
    CatalogCard.tsx                 ← реальная логика кнопки Install
  App.tsx                           ← после установки триггерим refresh дерева
```

## Rust backend

### Команда `marketplace_install_script`

Добавляем в `marketplace.rs`:

```rust
use std::path::PathBuf;
use tauri::Manager;

const RAW_BASE: &str = "https://raw.githubusercontent.com/your-org/ahk-manager-store/main";

#[tauri::command]
pub async fn marketplace_install_script(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
    script_id: String,
    entry_file: String,
) -> Result<String, String> {
    // 1. Получить первый scan path из БД
    let install_dir = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let scan_paths = crate::db::get_scan_paths(&conn);
        let first = scan_paths
            .first()
            .ok_or("Сначала добавьте папку для сканирования в Settings")?
            .clone();
        PathBuf::from(first).join("marketplace").join(&script_id)
    };

    // 2. Создать директорию
    std::fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Cannot create dir: {}", e))?;

    // 3. Скачать файл
    let url = format!("{}/scripts/{}/{}", RAW_BASE, script_id, entry_file);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("autlas/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    // 4. Записать в файл (атомарно через temp + rename)
    let target = install_dir.join(&entry_file);
    let temp = install_dir.join(format!(".tmp_{}", uuid::Uuid::new_v4()));

    std::fs::write(&temp, &bytes)
        .map_err(|e| format!("Cannot write temp file: {}", e))?;
    std::fs::rename(&temp, &target)
        .map_err(|e| format!("Cannot finalize file: {}", e))?;

    // 5. Эмитнуть событие чтобы фронт обновил дерево скриптов
    let _ = app.emit("marketplace-script-installed", &script_id);

    Ok(target.to_string_lossy().to_string())
}
```

Регистрируем команду в `lib.rs` `invoke_handler`.

### Критически важно: marketplace директория должна сканироваться

Поскольку мы кладём файл в `<scan_path>/marketplace/<id>/<entry>.ahk`, существующий механизм сканирования в `get_scripts` его автоматически найдёт — никаких изменений в reconciliation не нужно. Это и есть прелесть подхода: установленный скрипт магазина становится обычным локальным скриптом.

## Frontend

### `api.ts`

```typescript
export async function installMarketplaceScript(
  scriptId: string,
  entryFile: string
): Promise<string> {
  return await invoke<string>("marketplace_install_script", {
    scriptId,
    entryFile,
  });
}
```

### `useMarketplaceStore.ts` — расширяем

Добавляем tracking установленных в памяти + операцию установки:

```typescript
interface MarketplaceStore {
  // ...существующее
  items: CatalogScript[];
  installedIds: Set<string>;        // ← новое
  installingId: string | null;      // ← какая установка сейчас идёт

  installScript: (script: CatalogScript) => Promise<void>;
}

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  // ...
  installedIds: new Set(),
  installingId: null,

  installScript: async (script) => {
    if (get().installingId) return;
    set({ installingId: script.id });
    try {
      await installMarketplaceScript(script.id, script.entryFile);
      set(state => ({
        installedIds: new Set([...state.installedIds, script.id]),
        installingId: null,
      }));
      toast.success(`${script.name} установлен`);
    } catch (e) {
      set({ installingId: null });
      toast.error(`Ошибка установки: ${e}`);
    }
  },
}));
```

Обновить тип `CatalogScript` — добавить `entryFile: string`.

### `CatalogCard.tsx` — реальная кнопка Install

```tsx
export function CatalogCard({ script }: { script: CatalogScript }) {
  const installScript = useMarketplaceStore(s => s.installScript);
  const isInstalled = useMarketplaceStore(s => s.installedIds.has(script.id));
  const isInstalling = useMarketplaceStore(s => s.installingId === script.id);

  return (
    <div className="...карточка как раньше...">
      {/* иконка и текст без изменений */}

      <button
        onClick={() => installScript(script)}
        disabled={isInstalled || isInstalling}
        className={`
          px-4 py-2 rounded-lg font-medium transition-colors
          ${isInstalled
            ? 'bg-white/8 text-white/50 border border-white/10'
            : 'bg-indigo-500 hover:bg-indigo-400 text-white'}
          disabled:cursor-not-allowed
        `}
      >
        {isInstalling ? (
          <span className="flex items-center gap-2">
            <Spinner /> Installing...
          </span>
        ) : isInstalled ? (
          '✓ Installed'
        ) : (
          'Install'
        )}
      </button>
    </div>
  );
}
```

### Обновление дерева скриптов в `App.tsx`

После установки нужно чтобы новый скрипт появился в основном списке. Слушаем эвент от Rust:

```tsx
useEffect(() => {
  const unlisten = listen("marketplace-script-installed", () => {
    // существующая функция перезагрузки списка скриптов
    triggerScan();
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

`triggerScan` — это уже существующая функция в App.tsx которая вызывает `get_scripts(forceScan: true)`.

## Возможные проблемы

**Проблема:** scan_paths пуст. Если у пользователя ещё не настроены пути сканирования, нам некуда установить скрипт. Решение на этом этапе — показать ошибку "Сначала добавьте папку для сканирования в Settings". В будущем (этап 4) можно сделать дефолтную marketplace-папку в `%APPDATA%`.

**Проблема:** скрипт не появляется в дереве после установки. Проверить что:
- Файл реально создан (зайти в проводник в `<scan_path>/marketplace/`)
- `triggerScan` вызывается после события
- Папка `marketplace` находится внутри scan path (она по умолчанию)

**Проблема:** UAC / права записи. Если scan_path в защищённом месте (Program Files и т.п.) — установка не пройдёт. Решение пока: показать ошибку. В будущем — выбирать дефолтный путь в Documents.

## Тестирование

1. Подготовить минимум 2-3 реальных `.ahk` файла в репозитории
2. Обновить `catalog.json` с полем `entryFile`
3. В приложении убедиться что есть хотя бы один scan path
4. Запустить `npm run tauri dev`, открыть Store
5. Кликнуть Install на любом скрипте
6. Через секунду:
   - Кнопка → "✓ Installed"
   - Toast "Установлен"
7. Проверить файл создан: `<scan_path>/marketplace/<id>/<entry>.ahk`
8. Перейти на таб "All" — найти новый скрипт
9. Запустить его (Run) — он должен реально работать (попробовать хоткей)
10. Установить ещё один скрипт — оба видны в дереве
11. Закрыть и снова открыть приложение → файлы остались, но кнопки в Store снова "Install" (без БД пока)

## Что делает этот этап ценным сам по себе

**Это уже работающий магазин.** Не идеальный, не финальный — но реальный. Можно показать другу, скинуть ссылку на репо со скриптами, объяснить как добавлять свои. Базовая ценность ("я кликнул и у меня появился новый скрипт") достигнута.

После этого этапа у тебя есть выбор: либо сразу делать остальные 5 этапов, либо несколько недель пожить с этим и накопить feedback от пользователей. Оба варианта валидны — главное что фундамент работает.
