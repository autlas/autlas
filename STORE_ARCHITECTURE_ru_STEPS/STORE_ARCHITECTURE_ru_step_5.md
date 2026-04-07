# Этап 5 — Детальная страница скрипта

## Цель

Клик на карточку магазина открывает полноценную страницу скрипта: иконка, расширенные метаданные, README с форматированием, скриншоты, полный исходный код. Можно прочитать что внутри ДО установки — главный сигнал доверия.

После этого этапа магазин получает качественный скачок в UX.

## Что должно работать в конце этапа

- Клик на любую карточку (не на кнопку Install) → переход на детальную страницу
- Кнопка "Назад" (или breadcrumb) возвращает в browse
- На странице видно:
  - Большая иконка + название + автор + версия + лицензия
  - Кнопка Install/Installed (та же логика что в карточке)
  - Теги (если есть)
  - Табы: Overview, Source Code (опционально Hotkeys, Changelog)
- **Overview таб:** rendered markdown из README.md
- **Source Code таб:** полный код скрипта с подсветкой синтаксиса AHK
- Скриншоты (если есть в манифесте) — кликабельная галерея
- Если в README/source ошибка загрузки — сообщение об ошибке, не белый экран

## Что НЕ делаем на этом этапе

- Нет рейтингов и отзывов
- Нет "More from this author" / "Similar scripts"
- Нет changelog таба (этап 7 когда добавим версионирование)
- Нет hotkeys таба (этап 8)
- Нет реально полного manifest.json — только то что нужно сейчас (иконка, README, screenshots, tags)

## Расширение GitHub-репо

### `manifest.json` рядом с каждым скриптом

```
ahk-manager-store/
  catalog.json
  scripts/
    window-snapper/
      window-snapper.ahk
      manifest.json           ← новый файл
      README.md               ← подробное описание
      icon.png                ← опционально, 256x256
      screenshots/            ← опционально
        main.png
        usage.png
```

### Содержимое `manifest.json`

Минимальная схема для этого этапа:

```json
{
  "id": "window-snapper",
  "name": "Window Snapper",
  "displayName": "Window Snapper Pro",
  "version": "1.0.0",
  "description": "Привязка окон к четвертям экрана горячими клавишами",
  "author": {
    "name": "Alex Kozlov",
    "github": "alexkoz"
  },
  "license": "MIT",
  "tags": ["window-management", "hotkeys", "tiling"],
  "ahkVersion": "v2",
  "entryFile": "window-snapper.ahk",
  "readme": "README.md",
  "icon": "icon.png",
  "screenshots": [
    { "path": "screenshots/main.png", "caption": "Снап в левую половину" },
    { "path": "screenshots/usage.png", "caption": "Привязка к четвертям" }
  ]
}
```

### Дублирование в catalog.json

В `catalog.json` мы по-прежнему храним облегчённую версию (нужную для списка), а полный manifest качаем по требованию когда пользователь открывает деталку. Это позволяет каталогу оставаться лёгким даже на тысячи скриптов.

В `catalog.json` добавляем минимум информации для отображения в карточке: `tags`, `iconUrl` (опционально).

## Файлы которые создаём

```
tauri_app/src/components/marketplace/
  StoreDetail.tsx                   ← главный компонент детальной страницы
  StoreDetailHeader.tsx             ← шапка с иконкой/названием/Install
  StoreDetailTabs.tsx               ← переключатель табов
  ReadmeRenderer.tsx                ← markdown рендер
  SourceCodeViewer.tsx              ← подсветка AHK
  ScreenshotGallery.tsx             ← галерея скриншотов
```

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  marketplace.rs                    ← marketplace_get_script_detail, marketplace_get_script_source

tauri_app/src/
  api.ts                            ← новые wrapper-ы
  store/useMarketplaceStore.ts      ← navigation: storeView, detailId, navigate, goBack
  components/marketplace/
    MarketplaceView.tsx             ← роутер на основе storeView
    CatalogCard.tsx                 ← клик по карточке → navigateToDetail
```

## Зависимости

Добавляем одну новую npm-зависимость для рендера markdown:

```bash
npm install react-markdown remark-gfm
```

- `react-markdown` (~30KB) — рендер markdown в React
- `remark-gfm` (~10KB) — поддержка GitHub Flavored Markdown (таблицы, todo-чекбоксы, ссылки)

Подсветка AHK-синтаксиса — переиспользуем существующий механизм из приложения (он уже используется для просмотра локальных скриптов в `ScriptDetailPanel`).

## Rust backend

### Команда `marketplace_get_script_detail`

Скачивает полный manifest.json + README.md за один логический запрос:

```rust
#[derive(Serialize, Deserialize)]
pub struct ScriptDetail {
    pub manifest: serde_json::Value,  // полный JSON, фронт сам парсит
    pub readme: Option<String>,        // содержимое README.md или None
}

#[tauri::command]
pub async fn marketplace_get_script_detail(
    script_id: String,
) -> Result<ScriptDetail, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Manifest
    let manifest_url = format!("{}/scripts/{}/manifest.json", RAW_BASE, script_id);
    let manifest: serde_json::Value = client
        .get(&manifest_url)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    // README (опционально)
    let readme_filename = manifest.get("readme")
        .and_then(|v| v.as_str())
        .unwrap_or("README.md");
    let readme_url = format!("{}/scripts/{}/{}", RAW_BASE, script_id, readme_filename);
    let readme = client.get(&readme_url).send().await.ok()
        .and_then(|r| if r.status().is_success() { Some(r) } else { None });
    let readme_text = if let Some(r) = readme {
        r.text().await.ok()
    } else {
        None
    };

    Ok(ScriptDetail {
        manifest,
        readme: readme_text,
    })
}
```

### Команда `marketplace_get_script_source`

```rust
#[tauri::command]
pub async fn marketplace_get_script_source(
    script_id: String,
    entry_file: String,
) -> Result<String, String> {
    let url = format!("{}/scripts/{}/{}", RAW_BASE, script_id, entry_file);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}
```

## Frontend

### Навигация в Zustand store

```typescript
type StoreView = "browse" | "detail";

interface MarketplaceStore {
  // ...
  storeView: StoreView;
  detailId: string | null;
  detailData: ScriptDetail | null;
  isLoadingDetail: boolean;

  navigateToDetail: (id: string) => void;
  navigateBack: () => void;
}

navigateToDetail: (id) => {
  set({ storeView: "detail", detailId: id, detailData: null });
  // Лениво грузим детали
  getMarketplaceScriptDetail(id)
    .then(data => set({ detailData: data, isLoadingDetail: false }))
    .catch(e => toast.error(`Ошибка: ${e}`));
},

navigateBack: () => set({ storeView: "browse", detailId: null, detailData: null }),
```

### `MarketplaceView.tsx` — роутер

```tsx
export function MarketplaceView() {
  const storeView = useMarketplaceStore(s => s.storeView);

  if (storeView === "detail") {
    return <StoreDetail />;
  }
  return <StoreBrowse />;
}
```

(Старый код перевести в `StoreBrowse.tsx` — это просто переименование.)

### `CatalogCard.tsx` — клик по карточке

Кнопка Install — `stopPropagation` чтобы не триггерить открытие деталки. Остальная часть карточки кликабельна:

```tsx
const navigateToDetail = useMarketplaceStore(s => s.navigateToDetail);

<div
  onClick={() => navigateToDetail(script.id)}
  className="cursor-pointer ..."
>
  ...
  <button onClick={(e) => { e.stopPropagation(); installScript(script); }}>
    Install
  </button>
</div>
```

### `StoreDetail.tsx` — главный компонент

```tsx
export function StoreDetail() {
  const detailId = useMarketplaceStore(s => s.detailId);
  const detailData = useMarketplaceStore(s => s.detailData);
  const navigateBack = useMarketplaceStore(s => s.navigateBack);
  const [activeTab, setActiveTab] = useState<"overview" | "source">("overview");

  if (!detailData) {
    return <div className="p-6">Загрузка...</div>;
  }

  const { manifest, readme } = detailData;

  return (
    <div className="flex-1 overflow-auto">
      {/* Breadcrumb */}
      <div className="px-6 py-3 border-b border-white/10">
        <button onClick={navigateBack} className="text-white/60 hover:text-white">
          ← Store
        </button>
      </div>

      {/* Header */}
      <StoreDetailHeader manifest={manifest} />

      {/* Tabs */}
      <StoreDetailTabs activeTab={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="px-6 py-4">
        {activeTab === "overview" && (
          <>
            {manifest.screenshots && <ScreenshotGallery screenshots={manifest.screenshots} scriptId={detailId} />}
            {readme && <ReadmeRenderer markdown={readme} />}
            {!readme && <div className="text-white/50">Описание отсутствует</div>}
          </>
        )}

        {activeTab === "source" && (
          <SourceCodeViewer scriptId={detailId} entryFile={manifest.entryFile} />
        )}
      </div>
    </div>
  );
}
```

### `ReadmeRenderer.tsx`

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ReadmeRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-indigo-400 hover:text-indigo-300">
              {children}
            </a>
          ),
          code: ({ inline, children }) => (
            inline
              ? <code className="px-1 py-0.5 rounded bg-white/10 text-amber-300">{children}</code>
              : <pre className="p-3 rounded-lg bg-black/30 overflow-x-auto"><code>{children}</code></pre>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

Стили `prose-invert` из Tailwind Typography плагина — если он не подключен, можно временно использовать ручные стили или подключить `@tailwindcss/typography`.

### `SourceCodeViewer.tsx`

```tsx
export function SourceCodeViewer({ scriptId, entryFile }: Props) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarketplaceScriptSource(scriptId, entryFile)
      .then(setSource)
      .catch(e => setError(String(e)));
  }, [scriptId, entryFile]);

  if (error) return <div className="text-red-300">Не удалось загрузить: {error}</div>;
  if (!source) return <div className="text-white/50">Загрузка...</div>;

  return (
    <pre className="p-4 rounded-lg bg-black/30 overflow-x-auto text-sm">
      <code>{source}</code>
    </pre>
  );
}
```

**Важно:** в проекте уже есть AHK syntax highlighter (используется в `ScriptDetailPanel` для просмотра локальных скриптов). Найти и переиспользовать — это сделает SourceCodeViewer полноценным.

### `ScreenshotGallery.tsx`

```tsx
export function ScreenshotGallery({ screenshots, scriptId }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {screenshots.map((s, i) => (
          <img
            key={i}
            src={`${RAW_BASE_URL}/scripts/${scriptId}/${s.path}`}
            alt={s.caption || ""}
            onClick={() => setOpenIdx(i)}
            className="h-32 rounded-lg cursor-pointer hover:opacity-90 transition"
          />
        ))}
      </div>

      {openIdx !== null && (
        <div
          onClick={() => setOpenIdx(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        >
          <img
            src={`${RAW_BASE_URL}/scripts/${scriptId}/${screenshots[openIdx].path}`}
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        </div>
      )}
    </>
  );
}
```

`RAW_BASE_URL` — константа на фронте, та же что в Rust. Можно вынести в общий конфиг или передавать с бэкенда.

## Тестирование

1. Подготовить хотя бы один скрипт с полным набором: README.md, manifest.json, icon.png, screenshots/
2. Открыть Store, кликнуть на карточку (НЕ на Install)
3. Откроется детальная страница
4. Видна шапка с иконкой, названием, автором, кнопкой Install
5. Виден таб Overview по умолчанию
6. README отрендерен с заголовками, списками, ссылками, кодом
7. Видна галерея скриншотов, клик увеличивает
8. Переключиться на таб "Source Code" — виден полный код скрипта
9. Клик "← Store" → возвращает к списку
10. Кнопка Install на детальной странице — устанавливает скрипт корректно

## Что делает этот этап ценным сам по себе

Магазин начинает выглядеть как настоящий магазин (типа VS Code Extensions, Obsidian Plugins). Пользователь может **изучить скрипт перед установкой** — прочитать описание, посмотреть скриншоты, проверить код. Это критически важно для AHK-скриптов которые имеют полные права в системе. После этого этапа продукт становится не просто "list of links", а реальной площадкой с прозрачностью.
