# AHK Manager — Script Store Architecture

## Executive Summary

Магазин скриптов для AHK Manager. Zero-server архитектура: GitHub repo как реестр + CDN, GitHub Releases для дистрибуции, PR-based публикация. Obsidian/Scoop/Flow Launcher паттерн.

---

## 1. Архитектура верхнего уровня

```
                    GitHub Repo: ahk-community/script-store
                    ┌──────────────────────────────────────┐
                    │  catalog.json  (auto-generated index) │
                    │  scripts/                             │
                    │    window-snapper/                    │
                    │      manifest.json                    │
                    │      window-snapper.ahk               │
                    │    clipboard-manager/                 │
                    │      manifest.json                    │
                    │      ClipboardManager.ahk             │
                    │      lib/utils.ahk                   │
                    │  .github/workflows/                   │
                    │    validate-pr.yml                    │
                    │    build-catalog.yml                  │
                    └──────────────┬───────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    raw.githubusercontent.com   GitHub API       GitHub Actions
    (скачивание скриптов)    (публикация PR)    (валидация + build)
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │    AHK Manager (Tauri)     │
                    │  ┌──────────┐ ┌─────────┐ │
                    │  │  Rust    │ │  React   │ │
                    │  │ backend  │ │ frontend │ │
                    │  └──────────┘ └─────────┘ │
                    └───────────────────────────┘
```

**Ключевые решения:**
- **catalog.json** на raw.githubusercontent.com — один GET-запрос для всего каталога, ETag-кеширование, без rate limits
- **Directory-per-script** — поддержка multi-file скриптов с `#Include`
- **PR-based публикация** — fork → добавить скрипт → PR → CI валидация → review → merge
- **SQLite** для tracking установленных скриптов (расширение существующей БД)

---

## 2. Manifest Schema (`manifest.json`)

Каждый скрипт в репозитории имеет `manifest.json`:

```json
{
  "name": "window-snapper",
  "displayName": "Window Snapper",
  "version": "1.3.0",
  "description": "Snap windows to screen quarters and thirds with keyboard shortcuts",
  "author": {
    "name": "Alex Kozlov",
    "github": "alexkoz"
  },
  "ahk": {
    "version": "v2",
    "minVersion": "2.0.10",
    "entryFile": "window-snapper.ahk",
    "hasGui": false,
    "runsResident": true,
    "hotkeys": [
      { "keys": "#!Left", "action": "Snap window to left half" },
      { "keys": "#!Right", "action": "Snap window to right half" }
    ]
  },
  "permissions": {
    "requiresAdmin": false,
    "network": false,
    "clipboard": false,
    "registry": false,
    "shellExecute": false,
    "keyboardHook": true,
    "mouseHook": false
  },
  "categories": ["productivity"],
  "tags": ["window-management", "tiling", "snap"],
  "license": "MIT",
  "readme": "README.md",
  "icon": "icon.png",
  "screenshots": [
    { "path": "screenshots/main.png", "caption": "Main view" }
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/alexkoz/window-snapper"
  },
  "files": ["window-snapper.ahk", "README.md", "LICENSE"],
  "changelog": "Added multi-monitor support"
}
```

### Обязательные поля
- `name` — slug, `[a-z0-9-]`, уникальный
- `version` — semver
- `displayName`, `description`
- `author.name`
- `ahk.version` — `"v1"` | `"v2"` | `"v1+v2"`
- `ahk.entryFile` — главный `.ahk` файл
- `license` — SPDX identifier

### Категории (фиксированный список)
```
productivity    — управление окнами, буфер, текст
automation      — файловые операции, batch tasks
gaming          — макросы, overlays, ремапинг для игр
accessibility   — screen readers, магнификация
dev-tools       — IDE хелперы, git, терминал
media           — аудио/видео, скриншоты
system          — трей утилиты, мониторинг
input           — ремапинг клавиш/мыши
libraries       — переиспользуемые AHK библиотеки
```

### Permissions (для отображения перед установкой)
| Permission | Описание |
|---|---|
| `requiresAdmin` | Нужен запуск от администратора |
| `network` | HTTP запросы, скачивание |
| `clipboard` | Чтение/запись буфера |
| `registry` | Доступ к реестру Windows |
| `shellExecute` | Запуск внешних программ (Run/RunWait) |
| `keyboardHook` | Перехват клавиатуры (большинство hotkey скриптов) |
| `mouseHook` | Перехват мыши |
| `fileSystem` | Чтение/запись файлов вне своей директории |

---

## 3. Catalog Index (`catalog.json`)

Автогенерируется GitHub Actions при каждом merge в main:

```json
{
  "version": 2,
  "updatedAt": "2026-04-06T12:00:00Z",
  "scripts": [
    {
      "id": "window-snapper",
      "name": "Window Snapper",
      "description": "Snap windows to screen quarters and thirds",
      "author": "alexkoz",
      "version": "1.3.0",
      "ahkVersion": "v2",
      "category": "productivity",
      "tags": ["window-management", "tiling"],
      "hasGui": false,
      "runsResident": true,
      "hotkeys": ["#!Left", "#!Right"],
      "permissions": ["keyboardHook"],
      "license": "MIT",
      "size": 4096,
      "sha": "a1b2c3d4",
      "downloads": 342,
      "rating": 4.5,
      "createdAt": "2025-06-15",
      "updatedAt": "2026-03-20",
      "hasScreenshots": true
    }
  ],
  "categories": [
    { "id": "productivity", "name": "Productivity", "nameRu": "Продуктивность", "count": 45 }
  ],
  "collections": [
    {
      "id": "essentials",
      "title": "Must-Have Scripts",
      "titleRu": "Необходимые скрипты",
      "scriptIds": ["window-snapper", "clipboard-manager", "text-expander"]
    }
  ]
}
```

**Размер:** ~400 bytes на скрипт. 1000 скриптов = ~400KB raw, ~60KB gzipped. Один HTTP запрос.

**Fetching стратегия:**
1. Запуск приложения → GET `catalog.json` с `If-None-Match: <cached_etag>`
2. Если `304 Not Modified` → используем кеш (бесплатный запрос, не считается в rate limit)
3. Если `200` → обновляем кеш + ETag
4. Повторная проверка: каждые 6 часов в фоне

---

## 4. Frontend Architecture

### Zustand Store (отдельный от useTreeStore)

```typescript
// src/store/useMarketplaceStore.ts
interface MarketplaceStore {
  // Каталог
  items: CatalogScript[];
  lastFetchedAt: number | null;
  isFetching: boolean;

  // Фильтры
  searchQuery: string;
  category: string | null;
  ahkVersionFilter: "v1" | "v2" | null;
  sortBy: "popular" | "recent" | "name" | "rating";

  // Навигация внутри стора
  storeView: "browse" | "detail" | "installed";
  detailId: string | null;

  // Установленные скрипты
  installed: Record<string, InstalledMeta>;
  operations: InstallOp[]; // очередь install/update/uninstall

  // Сеть
  isOnline: boolean;
}
```

**Persistence:** `installed`, `items` (кеш каталога), `lastFetchedAt`, `sortBy` — в localStorage.

### Поиск: MiniSearch

- **4KB** gzipped, лучший баланс features/size
- Fuzzy + prefix search, auto-suggest, mutable index
- Weighted fields: `name` (x3), `tags` (x2), `description` (x1.5)
- Debounce через `useDeferredValue` (React 19)
- При нулевом результате — `autoSuggest` с relaxed fuzzy как "Did you mean?"

```typescript
const index = new MiniSearch({
  fields: ['name', 'description', 'tags_joined', 'author'],
  storeFields: ['name', 'description', 'author', 'category', 'downloads'],
  searchOptions: {
    boost: { name: 3, tags_joined: 2, description: 1.5 },
    fuzzy: 0.2,
    prefix: true,
  },
});
```

### Навигация

Store — новый таб в сайдбаре (иконка магазина), наравне с Hub/All/Settings:

```
Sidebar:
  [Hub]
  [All]
  [Untagged]
  --- user tags ---
  [Store]  ← badge с количеством обновлений
  [Settings]
```

Внутри Store — собственная навигация:
- **Browse** — featured + trending + categories
- **Detail** — страница скрипта
- **Installed** — установленные с проверкой обновлений

---

## 5. UI Design

### Store Landing Page

```
┌──────────────────────────────────────────────────────┐
│  🔍 Search scripts...                    [Filters ▾] │
├──────────────────────────────────────────────────────┤
│ [All] [Productivity] [Gaming] [System] [Input] [+]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ★ Featured                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                    │
│  │  Card  │ │  Card  │ │  Card  │  ← hero cards     │
│  └────────┘ └────────┘ └────────┘                    │
│                                                      │
│  Trending                                            │
│  ├─ Script row ──────────────────── [Install] ─┤    │
│  ├─ Script row ──────────────────── [Install] ─┤    │
│  ├─ Script row ──────────────────── [Install] ─┤    │
│                                                      │
│  Recently Updated                                    │
│  ├─ Script row ──────────────────── [Install] ─┤    │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

### Script Card (список)

```
┌─────────────────────────────────────────────────┐
│  [Icon]  Window Snapper                 [Install]│
│          by alexkoz  ·  AHK v2                   │
│          Snap windows to screen quarters...      │
│          ↓ 342  ★ 4.5  🏷 productivity           │
└─────────────────────────────────────────────────┘
```

### Detail Page

```
┌──────────────────────────────────────────────────┐
│  [← Back]  Store / Window Snapper                │
├──────────────────────────────────────────────────┤
│  [Icon 48px]                                     │
│  Window Snapper                    [★ Install]   │
│  by alexkoz  ·  v1.3.0  ·  MIT                  │
│  ★★★★☆ 4.5 (38)  ·  342 installs               │
│  Tags: [productivity] [tiling] [snap]            │
├──────────────────────────────────────────────────┤
│  [Overview] [Hotkeys] [Changelog] [Source]       │
├──────────────────────────────────────────────────┤
│                                                  │
│  Permissions:                                    │
│  ✓ Keyboard hooks                                │
│  ✗ No network  ✗ No admin  ✗ No registry        │
│                                                  │
│  ## Description                                  │
│  Rendered markdown README...                     │
│                                                  │
│  ## Screenshots                                  │
│  ┌────┐ ┌────┐                                   │
│  │    │ │    │                                    │
│  └────┘ └────┘                                   │
│                                                  │
│  ## Hotkeys                                      │
│  Win+Alt+← → Snap left                          │
│  Win+Alt+→ → Snap right                         │
└──────────────────────────────────────────────────┘
```

### Install Flow

```
[Install] → [Installing...] → [✓ Installed ▾]
  blue       blue+spinner      green/muted

▾ dropdown:
  ▶ Run
  ↻ Update (if available)
  ✕ Uninstall
```

**Trust prompt** для первой установки от unverified автора:

```
┌─────────────────────────────────────┐
│  ⚠ Install "Script Name"?           │
│                                      │
│  Permissions:                        │
│  • Keyboard hooks                    │
│  • Runs external commands            │
│                                      │
│  Author: username (not verified)     │
│                                      │
│  [View Source]  [Cancel]  [Install]  │
└─────────────────────────────────────┘
```

### Стилизация (Glassmorphism)

```css
/* Store card */
bg-white/5 backdrop-blur-xl border border-white/8 rounded-xl
hover: bg-white/10 border-white/15

/* Install button */
bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg

/* Installed button */
bg-white/8 text-white/50 border border-white/10

/* Category chip */
bg-white/10 text-white/70 rounded-full px-3 py-1
```

---

## 6. Rust Backend

### Новые Tauri Commands

```rust
// Каталог
marketplace_get_catalog() → Catalog
marketplace_search(query, category, sort, page) → CatalogPage

// Установка
marketplace_install_script(id) → Result<String, String>  // returns install path
marketplace_uninstall_script(id, deleteFile: bool) → Result<(), String>
marketplace_update_script(id) → Result<(), String>
marketplace_check_updates() → Vec<UpdateInfo>
marketplace_rollback_script(id) → Result<(), String>

// Детали
marketplace_get_script_detail(id) → ScriptDetail  // full manifest + README
marketplace_get_script_source(id) → String         // source code preview
```

### DB Schema (расширение существующей SQLite)

```sql
CREATE TABLE IF NOT EXISTS marketplace_scripts (
    marketplace_id    TEXT PRIMARY KEY,
    script_id         TEXT REFERENCES scripts(id),
    install_path      TEXT NOT NULL,
    source_url        TEXT NOT NULL,
    version           TEXT NOT NULL,
    prev_version      TEXT,
    content_hash      TEXT NOT NULL,
    prev_content_hash TEXT,
    installed_at      TEXT NOT NULL,
    updated_at        TEXT,
    last_check_at     TEXT,
    last_etag         TEXT,
    auto_update       INTEGER DEFAULT 0
);
```

### Download Flow

```rust
// 1. Fetch via raw.githubusercontent.com (no rate limit)
// 2. Stream with progress events to frontend
// 3. SHA-256 verify
// 4. Write to temp file
// 5. Atomic rename to target
// 6. Record in DB
// 7. Emit marketplace-install-complete event
// 8. Trigger script tree refresh
```

**Install directory:** `<first_scan_path>/marketplace/` — отдельная папка, добавляется как implicit scan path.

### Update Checking

```
1. App launch (5s delay) → GET catalog.json (conditional)
2. Compare installed versions vs catalog versions
3. If updates found → emit marketplace-updates-available
4. Frontend shows badge on Store tab
5. "Update All" button in Store → batch download
```

---

## 7. Security Model

### Trust Tiers

| Tier | Кто | Review | Publish delay |
|------|-----|--------|---------------|
| **Unverified** | Новый автор | Full manual review | 72h |
| **Community** | 1+ скрипт прошёл review | Automated + 1 reviewer | 24h |
| **Trusted** | 3+ скриптов без инцидентов | Auto-merge если CI pass | 0h |
| **Curated** | Core team | Pre-approved | 0h |

### Автоматическое сканирование (CI)

```
CRITICAL patterns (block PR):
  - Download + Run combination
  - URLDownloadToFile
  - RunWait.*powershell.*-enc
  - RegWrite.*\Run (startup persistence)
  - FileInstall (embedded binary)

HIGH patterns (flag for review):
  - Run/RunWait with dynamic variables
  - RegWrite/RegDelete
  - DllCall with raw addresses
  - ClipboardAll monitoring
```

### Permission Display

Перед установкой показываем parsed permissions из manifest:
- **Safe** (green): только hotkeys, window management
- **Caution** (yellow): file access, Run, clipboard
- **Dangerous** (red): network + Run, registry, admin

### Blocklist

```json
{
  "blocked": [
    {
      "scriptId": "malicious-script",
      "versions": ["1.2.0"],
      "reason": "Data exfiltration",
      "action": "kill_and_warn"
    }
  ]
}
```

Проверяется при запуске. Если установленный скрипт в blocklist → kill + предупреждение.

---

## 8. GitHub CI/CD

### Валидация PR (`validate-pr.yml`)

```yaml
on:
  pull_request:
    paths: ['scripts/**']

jobs:
  validate:
    runs-on: windows-latest
    steps:
      - Validate manifest.json schema
      - Check AHK syntax (AutoHotkey.exe /validate)
      - Security pattern scan
      - File size limits (<500KB per script)
      - Duplicate ID check
      - Auto-label by category
```

### Build catalog (`build-catalog.yml`)

```yaml
on:
  push:
    branches: [main]
    paths: ['scripts/**']

jobs:
  build:
    steps:
      - Generate catalog.json from all manifest.json files
      - Commit and push catalog.json
```

---

## 9. Contribution Workflow

### Для авторов (Phase 1 — PR-based)

1. Fork `ahk-community/script-store`
2. Создать `scripts/<script-name>/`
3. Добавить `manifest.json` + `.ahk` файлы
4. Открыть PR
5. CI проверяет автоматически
6. Maintainer review → merge
7. catalog.json пересобирается автоматически

### In-App Publishing (Phase 2)

1. GitHub OAuth Device Flow в приложении
2. Форма публикации → автоматическое создание PR через API
3. Fork → branch → commit files → open PR — 4 API вызова

---

## 10. Tech Stack

### Frontend (новые зависимости)
| Пакет | Размер | Зачем |
|-------|--------|-------|
| `minisearch` | 4KB gz | Client-side полнотекстовый поиск |
| `@tanstack/react-query` | 13KB gz | Кеширование, dedup, infinite scroll, mutations |

### Rust (уже в проекте)
- `reqwest` — HTTP клиент (уже есть)
- `sha2` — хеш верификация (уже есть)
- `serde_json` — парсинг manifest/catalog (уже есть)
- `rusqlite` — DB (уже есть)

### Новый Rust crate
| Crate | Зачем |
|-------|-------|
| `keyring` | Безопасное хранение GitHub токена в OS keyring (Phase 2) |

---

## 11. Implementation Phases

### Phase 1: MVP (Read-Only Store)

**Scope:** Browsing + Install + Updates

1. Создать GitHub repo `ahk-community/script-store` с 10-15 seed скриптами
2. GitHub Action для генерации `catalog.json`
3. Rust: `marketplace_get_catalog`, `marketplace_install_script`, `marketplace_check_updates`
4. React: `useMarketplaceStore`, store tab в sidebar, browse view, detail view
5. MiniSearch для client-side поиска
6. Install/uninstall/update flow
7. Permission display перед установкой
8. Blocklist механизм

**Новые файлы:**
```
src/store/useMarketplaceStore.ts
src/hooks/useMarketplaceSearch.ts
src/components/marketplace/
  MarketplaceView.tsx
  StoreBrowse.tsx
  StoreDetail.tsx
  StoreInstalled.tsx
  CatalogCard.tsx
  InstallButton.tsx
  PermissionBadge.tsx
src-tauri/src/marketplace.rs
```

### Phase 2: Publishing

- GitHub OAuth Device Flow
- In-app publish form
- PR creation via API

### Phase 3: Community

- Ratings via GitHub Discussions
- Community flagging
- Trusted author system
- Download counting (Cloudflare Worker, free tier)

---

## 12. References

**Studied implementations:**
- Obsidian Community Plugins — single JSON registry + GitHub Releases
- Scoop — JSON manifests in monorepo, raw CDN downloads
- Flow Launcher — plugins.json + GitHub Releases
- Espanso Hub — YAML manifests + GitHub Releases
- Raycast — monorepo + PR review
- VS Code / Open VSX — full-stack (reference only)
- Zed — submodules + S3

**All zero-server projects converge on the same pattern:**
1. Single JSON index file in a GitHub repo
2. GitHub Releases or raw URLs for file distribution
3. PR-based submission with CI validation
4. Local SQLite/JSON for tracking installed items
