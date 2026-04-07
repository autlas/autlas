# Этап 2 — Реальный `catalog.json` с GitHub

## Цель

Каталог скриптов больше не хардкодится в коде приложения, а скачивается с GitHub при запуске. Изменил `catalog.json` в репозитории — обновил каталог в приложении (после перезапуска).

После этого этапа доказана главная архитектурная гипотеза: **GitHub как backend работает**.

## Что должно работать в конце этапа

- При первом запуске приложения магазин показывает skeleton-карточки (loading state)
- Через 1-2 секунды skeleton сменяется реальными карточками из `catalog.json` на GitHub
- Если изменить `catalog.json` в GitHub-репо и перезапустить приложение — изменения видны
- При повторном открытии магазина (без перезапуска) данные не запрашиваются повторно (кеш в Zustand)
- Если интернета нет — показывается ошибка с кнопкой "Retry"
- Тот же визуальный каркас этапа 1, только данные теперь "живые"

## Что НЕ делаем на этом этапе

- Не делаем ETag/conditional requests (это позже когда добавим автообновление каталога)
- Не кешируем catalog.json на диск (только в памяти)
- Не делаем фоновую периодическую перепроверку (только при запуске app)
- Кнопка Install всё ещё ничего не делает
- Никаких manifest.json пока — только catalog.json с минимальными метаданными

## Подготовка GitHub-репозитория

### Создать новый репозиторий

Имя на твой выбор, например `ahk-manager-store` или `ahk-script-catalog`. Публичный (чтобы raw.githubusercontent работал без авторизации).

### Структура репозитория на этом этапе

```
ahk-manager-store/
  catalog.json          ← единственный важный файл
  README.md             ← краткое описание для людей
```

### Содержимое `catalog.json`

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
      "category": "productivity"
    },
    {
      "id": "clipboard-history",
      "name": "Clipboard History",
      "description": "История буфера обмена с поиском",
      "author": "mariac",
      "ahkVersion": "v2",
      "category": "productivity"
    }
    // ... ещё несколько
  ]
}
```

Те же самые 5 скриптов из этапа 1, теперь живут на GitHub.

### URL для скачивания

После пуша файл доступен по адресу:
```
https://raw.githubusercontent.com/<твой-username>/<repo-name>/main/catalog.json
```

Этот URL пока вшиваем в код Rust как константу. Когда-нибудь сделаем настройкой.

## Файлы которые создаём

```
tauri_app/src-tauri/src/
  marketplace.rs                    ← новый модуль для всех marketplace-команд

tauri_app/src/
  components/marketplace/
    SkeletonCard.tsx                ← skeleton для loading state
```

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  lib.rs                            ← объявить mod marketplace, зарегистрировать команду

tauri_app/src/
  store/useMarketplaceStore.ts      ← добавить isFetching, error, fetchCatalog action
  components/marketplace/MarketplaceView.tsx  ← вызов fetchCatalog при mount, loading/error states
  api.ts                            ← TypeScript wrapper для команды
```

## Rust backend

### `marketplace.rs`

Новый модуль. Минимальный API на этом этапе — одна команда:

```rust
use serde::{Deserialize, Serialize};

const CATALOG_URL: &str = "https://raw.githubusercontent.com/your-org/ahk-manager-store/main/catalog.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct CatalogScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    #[serde(rename = "ahkVersion")]
    pub ahk_version: String,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Catalog {
    pub version: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub scripts: Vec<CatalogScript>,
}

#[tauri::command]
pub async fn marketplace_get_catalog() -> Result<Catalog, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("AHKManager/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(CATALOG_URL)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let catalog: Catalog = resp
        .json()
        .await
        .map_err(|e| format!("Invalid catalog JSON: {}", e))?;

    Ok(catalog)
}
```

`reqwest` уже в зависимостях проекта, ничего добавлять не нужно.

### Регистрация в `lib.rs`

В верхней части файла:
```rust
mod marketplace;
```

В `tauri::Builder::default().invoke_handler(...)` добавить:
```rust
marketplace::marketplace_get_catalog,
```

## Frontend

### `api.ts` — wrapper

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface CatalogScript {
  id: string;
  name: string;
  description: string;
  author: string;
  ahkVersion: "v1" | "v2";
  category: string;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  scripts: CatalogScript[];
}

export async function getMarketplaceCatalog(): Promise<Catalog> {
  return await invoke<Catalog>("marketplace_get_catalog");
}
```

### `useMarketplaceStore.ts` — обновляем

```typescript
import { create } from "zustand";
import { getMarketplaceCatalog, type CatalogScript } from "../api";

interface MarketplaceStore {
  items: CatalogScript[];
  isFetching: boolean;
  error: string | null;
  hasFetched: boolean;

  fetchCatalog: () => Promise<void>;
}

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  items: [],
  isFetching: false,
  error: null,
  hasFetched: false,

  fetchCatalog: async () => {
    if (get().isFetching) return;
    set({ isFetching: true, error: null });
    try {
      const catalog = await getMarketplaceCatalog();
      set({
        items: catalog.scripts,
        isFetching: false,
        hasFetched: true,
      });
    } catch (e) {
      set({
        isFetching: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));
```

`hasFetched` нужен чтобы при повторном открытии магазина не делать новый запрос. Кеш живёт всю сессию приложения.

### `MarketplaceView.tsx` — добавляем загрузку и состояния

```tsx
export function MarketplaceView() {
  const { items, isFetching, error, hasFetched, fetchCatalog } = useMarketplaceStore();

  useEffect(() => {
    if (!hasFetched) {
      fetchCatalog();
    }
  }, [hasFetched, fetchCatalog]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Store</h1>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
          <div>Не удалось загрузить каталог: {error}</div>
          <button
            onClick={fetchCatalog}
            className="mt-2 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {isFetching && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {!isFetching && !error && (
        <div className="space-y-3">
          {items.map(item => <CatalogCard key={item.id} script={item} />)}
        </div>
      )}
    </div>
  );
}
```

### `SkeletonCard.tsx`

```tsx
export function SkeletonCard() {
  return (
    <div className="
      flex items-center gap-4 p-4 rounded-xl
      bg-white/5 backdrop-blur-xl border border-white/8
      animate-pulse
    ">
      <div className="w-12 h-12 rounded-lg bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-white/10" />
        <div className="h-3 w-1/4 rounded bg-white/10" />
        <div className="h-3 w-3/4 rounded bg-white/10" />
      </div>
      <div className="w-20 h-9 rounded-lg bg-white/10" />
    </div>
  );
}
```

## Возможные проблемы и их решение

**Проблема:** CORS — НЕ возникает, потому что Tauri делает запросы из Rust, а не из браузера. Это одно из главных преимуществ Tauri над Electron+web в этой задаче.

**Проблема:** Tauri разрешения — в `tauri.conf.json` или `capabilities/default.json` нужно убедиться что HTTP-запросы к raw.githubusercontent.com разрешены. Поскольку мы используем `reqwest` напрямую из Rust (а не Tauri HTTP plugin), никакие capabilities не нужны — Rust делает что хочет.

**Проблема:** GitHub отдаёт устаревшую версию файла — у `raw.githubusercontent.com` есть кеш на стороне Fastly (~5 минут). Если только что запушил `catalog.json` и не видишь изменений — подожди или добавь `?nocache=<random>` к URL для теста.

**Проблема:** JSON parse error — внимательно следи за валидностью JSON в репозитории. Удобно в VSCode редактировать с подсветкой.

## Тестирование

1. Создать и запушить репозиторий с `catalog.json`
2. Прописать URL в `marketplace.rs`
3. Запустить `npm run tauri dev`
4. Открыть таб Store
5. Видны skeleton-карточки на 1-2 секунды → потом реальные данные
6. Изменить `catalog.json` на GitHub (например, поменять описание скрипта)
7. Закрыть и снова открыть приложение
8. В магазине видна обновлённая версия
9. Отключить интернет, перезапустить app → клик Store → видна ошибка с кнопкой Retry
10. Включить интернет, нажать Retry → каталог загружается

## Что делает этот этап ценным сам по себе

Даже остановившись здесь, ты доказал главное архитектурное предположение: **можно держать каталог скриптов в обычном GitHub-репозитории и тянуть его в десктоп-приложение одним HTTP-запросом без всякого backend-сервера**. Дальше это масштабируется до сотен и тысяч скриптов одной строчкой кода.
