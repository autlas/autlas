# Этап 6 — Поиск, категории, фильтры

## Цель

Каталог становится навигабельным. Поиск по названию/описанию/тегам, фильтрация по категориям и версии AHK, сортировка. С этого момента магазин полезен даже когда в нём 50+ скриптов.

## Что должно работать в конце этапа

- Поисковая строка наверху: ввод текста → мгновенная фильтрация результатов
- Поиск работает по name, description, tags, author
- Поддержка опечаток ("clipbord" находит "clipboard")
- Подсказки "Did you mean?" при нулевом результате
- Горизонтальный таб-бар категорий: All, Productivity, Gaming, System, Input, Dev Tools, Media, Accessibility, Libraries
- Клик на категорию фильтрует список
- Dropdown "Sort by": Popular, Recent, Name (A-Z), Updated
- Dropdown "AHK Version": Any, v1, v2
- Активные фильтры показываются как dismissible chips сверху списка
- Кнопка "Clear all filters"
- Все фильтры комбинируются (AND логика между разными типами)
- Состояние фильтров сохраняется при переходе в Detail и обратно
- Фильтры сбрасываются между сессиями (sessionStorage не localStorage)

## Что НЕ делаем на этом этапе

- Нет infinite scroll/пагинации (на этом этапе максимум 100 скриптов в каталоге, помещаются все)
- Нет facet counts ("Productivity (12)") — это потом
- Нет сохранённых поисков
- Нет recent searches
- Нет advanced filters (permissions, license)

## Зависимости

```bash
npm install minisearch
```

**MiniSearch** — 4KB gzipped, лучший баланс для нашего случая:
- Fuzzy + prefix search из коробки
- Auto-suggest для "Did you mean?"
- Мутабельный индекс (можно добавлять/удалять при обновлении каталога)
- Подсветка совпадений
- Клин API без избыточной конфигурации

## Расширение `catalog.json`

Категории и теги уже могут быть в каталоге. Если их нет — добавляем:

```json
{
  "id": "window-snapper",
  "name": "Window Snapper",
  ...
  "category": "productivity",
  "tags": ["window-management", "tiling", "hotkeys"]
}
```

Также добавляем секцию категорий в catalog для отображения табов:

```json
{
  "version": 1,
  "scripts": [...],
  "categories": [
    { "id": "productivity",  "name": "Productivity",  "nameRu": "Продуктивность" },
    { "id": "gaming",        "name": "Gaming",        "nameRu": "Игры" },
    { "id": "system",        "name": "System",        "nameRu": "Система" },
    { "id": "input",         "name": "Input",         "nameRu": "Ввод" },
    { "id": "dev-tools",     "name": "Dev Tools",     "nameRu": "Разработка" },
    { "id": "media",         "name": "Media",         "nameRu": "Медиа" },
    { "id": "accessibility", "name": "Accessibility", "nameRu": "Доступность" },
    { "id": "libraries",     "name": "Libraries",     "nameRu": "Библиотеки" }
  ]
}
```

## Файлы которые создаём

```
tauri_app/src/
  hooks/useMarketplaceSearch.ts     ← MiniSearch hook
  components/marketplace/
    StoreSearchBar.tsx              ← поисковая строка с auto-suggest
    StoreCategoryTabs.tsx           ← горизонтальные табы категорий
    StoreFiltersBar.tsx             ← AHK version + sort dropdowns
    StoreActiveFilters.tsx          ← chips активных фильтров
    StoreEmptyState.tsx             ← "Did you mean?" + suggestions
```

## Файлы которые трогаем

```
tauri_app/src/
  store/useMarketplaceStore.ts      ← поля searchQuery, category, ahkVersionFilter, sortBy
  components/marketplace/
    StoreBrowse.tsx                 ← интеграция всех фильтров
```

## Zustand store — расширение

```typescript
type SortField = "popular" | "recent" | "name" | "updated";

interface MarketplaceStore {
  // ...
  searchQuery: string;
  category: string | null;
  ahkVersionFilter: "v1" | "v2" | null;
  sortBy: SortField;

  setSearchQuery: (q: string) => void;
  setCategory: (c: string | null) => void;
  setAhkVersionFilter: (v: "v1" | "v2" | null) => void;
  setSortBy: (s: SortField) => void;
  resetFilters: () => void;
}
```

Persistence через `sessionStorage`:

```typescript
useMarketplaceStore.subscribe(
  state => ({
    searchQuery: state.searchQuery,
    category: state.category,
    ahkVersionFilter: state.ahkVersionFilter,
    sortBy: state.sortBy,
  }),
  filters => sessionStorage.setItem("marketplace_filters", JSON.stringify(filters))
);
```

## Hook `useMarketplaceSearch`

Главная логика поиска:

```typescript
import { useMemo, useDeferredValue } from "react";
import MiniSearch from "minisearch";
import { useMarketplaceStore } from "../store/useMarketplaceStore";

export function useMarketplaceSearch() {
  const items = useMarketplaceStore(s => s.items);
  const searchQuery = useMarketplaceStore(s => s.searchQuery);
  const category = useMarketplaceStore(s => s.category);
  const ahkVersionFilter = useMarketplaceStore(s => s.ahkVersionFilter);
  const sortBy = useMarketplaceStore(s => s.sortBy);

  // useDeferredValue из React 19 — встроенный debounce
  const deferredQuery = useDeferredValue(searchQuery);

  // Индекс пересоздаётся когда меняется список (перезагрузка каталога)
  const index = useMemo(() => {
    const ms = new MiniSearch({
      fields: ["name", "description", "tagsJoined", "author"],
      storeFields: ["id"],
      searchOptions: {
        boost: { name: 3, tagsJoined: 2, description: 1.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
    ms.addAll(items.map(item => ({
      ...item,
      tagsJoined: (item.tags || []).join(" "),
    })));
    return ms;
  }, [items]);

  const results = useMemo(() => {
    let filtered = items;

    // Текстовый поиск
    if (deferredQuery.trim()) {
      const matchedIds = new Set(index.search(deferredQuery).map(r => r.id));
      filtered = filtered.filter(item => matchedIds.has(item.id));
    }

    // Категория
    if (category) {
      filtered = filtered.filter(item => item.category === category);
    }

    // Версия AHK
    if (ahkVersionFilter) {
      filtered = filtered.filter(item => item.ahkVersion === ahkVersionFilter);
    }

    // Сортировка
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "recent": return (b.createdAt || "").localeCompare(a.createdAt || "");
        case "updated": return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        case "popular":
        default: return (b.downloads || 0) - (a.downloads || 0);
      }
    });

    return filtered;
  }, [items, index, deferredQuery, category, ahkVersionFilter, sortBy]);

  // Подсказки при нулевом результате
  const suggestions = useMemo(() => {
    if (results.length > 0 || !deferredQuery.trim()) return [];
    return index.autoSuggest(deferredQuery, { fuzzy: 0.4, prefix: true }).slice(0, 3);
  }, [index, deferredQuery, results.length]);

  return { results, suggestions, deferredQuery };
}
```

## Компоненты UI

### `StoreSearchBar.tsx`

```tsx
export function StoreSearchBar() {
  const searchQuery = useMarketplaceStore(s => s.searchQuery);
  const setSearchQuery = useMarketplaceStore(s => s.setSearchQuery);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
      <input
        type="text"
        placeholder="Поиск скриптов..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="
          w-full pl-9 pr-4 py-2.5 rounded-xl
          bg-white/5 backdrop-blur-xl border border-white/10
          text-white/90 placeholder:text-white/30
          focus:outline-none focus:border-white/25 focus:bg-white/8
        "
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
```

### `StoreCategoryTabs.tsx`

```tsx
export function StoreCategoryTabs() {
  const category = useMarketplaceStore(s => s.category);
  const setCategory = useMarketplaceStore(s => s.setCategory);
  const categories = useMarketplaceStore(s => s.categories); // из catalog
  const { i18n } = useTranslation();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
      <CategoryChip
        label="Все"
        active={category === null}
        onClick={() => setCategory(null)}
      />
      {categories.map(cat => (
        <CategoryChip
          key={cat.id}
          label={i18n.language === "ru" ? cat.nameRu : cat.name}
          active={category === cat.id}
          onClick={() => setCategory(cat.id)}
        />
      ))}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-1.5 rounded-full whitespace-nowrap text-sm font-medium transition-all
        ${active
          ? 'bg-indigo-500 text-white'
          : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/8'}
      `}
    >
      {label}
    </button>
  );
}
```

### `StoreFiltersBar.tsx`

Маленькая полоса с двумя dropdown:

```tsx
<div className="flex items-center gap-3">
  <span className="text-xs text-white/40">Сортировка:</span>
  <Select value={sortBy} onChange={setSortBy}>
    <option value="popular">Популярные</option>
    <option value="recent">Недавние</option>
    <option value="updated">Обновлённые</option>
    <option value="name">По имени</option>
  </Select>

  <span className="text-xs text-white/40 ml-3">AHK:</span>
  <Select value={ahkVersionFilter ?? ""} onChange={...}>
    <option value="">Любая</option>
    <option value="v2">v2</option>
    <option value="v1">v1</option>
  </Select>
</div>
```

### `StoreActiveFilters.tsx`

Чипы активных фильтров с возможностью удалить:

```tsx
const chips = [];
if (category) chips.push({ key: "cat", label: categoryName(category), onRemove: () => setCategory(null) });
if (ahkVersionFilter) chips.push({ key: "ahk", label: `AHK ${ahkVersionFilter}`, onRemove: () => setAhkVersionFilter(null) });

if (chips.length === 0) return null;

return (
  <div className="flex flex-wrap items-center gap-1.5">
    {chips.map(chip => (
      <button
        key={chip.key}
        onClick={chip.onRemove}
        className="px-2 py-0.5 rounded-full bg-white/10 text-xs flex items-center gap-1 hover:bg-white/15"
      >
        {chip.label} <X size={10} />
      </button>
    ))}
    {chips.length > 1 && (
      <button onClick={resetFilters} className="text-xs text-white/40 hover:text-white/60 ml-1">
        Сбросить всё
      </button>
    )}
  </div>
);
```

### `StoreEmptyState.tsx`

```tsx
export function StoreEmptyState({ query, suggestions }: Props) {
  return (
    <div className="text-center py-12">
      <Search className="mx-auto text-white/20 mb-3" size={32} />
      <div className="text-white/70 mb-2">
        По запросу <span className="text-white font-medium">"{query}"</span> ничего не найдено
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-white/40 mb-2">Возможно, вы имели в виду:</div>
          <div className="flex justify-center gap-2">
            {suggestions.map(s => (
              <button
                key={s.suggestion}
                onClick={() => setSearchQuery(s.suggestion)}
                className="px-3 py-1 rounded-full bg-white/10 text-sm hover:bg-white/15"
              >
                {s.suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### `StoreBrowse.tsx` — собираем всё вместе

```tsx
export function StoreBrowse() {
  const { results, suggestions, deferredQuery } = useMarketplaceSearch();
  const isFetching = useMarketplaceStore(s => s.isFetching);

  return (
    <div className="flex-1 overflow-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 space-y-3">
        <StoreSearchBar />
        <StoreCategoryTabs />
        <div className="flex items-center justify-between">
          <StoreActiveFilters />
          <StoreFiltersBar />
        </div>
      </div>

      {/* Results */}
      <div className="px-6 py-4">
        {isFetching ? (
          <SkeletonList count={5} />
        ) : results.length === 0 ? (
          <StoreEmptyState query={deferredQuery} suggestions={suggestions} />
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-white/40 mb-2">{results.length} скриптов</div>
            {results.map(item => <CatalogCard key={item.id} script={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}
```

## Тестирование

1. Положить в каталог 15-20 скриптов разных категорий и версий AHK
2. Открыть Store
3. Ввести в поиск "win" → должны найтись все скрипты с window/win в названии
4. Ввести опечатку "clipbord" → должен найтись Clipboard Manager
5. Ввести бессмыслицу "asdfgh" → empty state с подсказкой
6. Кликнуть на категорию "Productivity" → отфильтровались
7. Добавить фильтр AHK v2 → активный chip "AHK v2"
8. Изменить сортировку на "По имени" → список перестроился
9. Клик на chip → фильтр убрался
10. Клик "Сбросить всё" → все фильтры обнулились
11. Перейти в детальную страницу → вернуться → фильтры сохранились
12. Закрыть и снова открыть приложение → фильтры сбросились (sessionStorage)

## Что делает этот этап ценным сам по себе

С 50+ скриптами магазин без поиска неудобен. С поиском и категориями это уже **навигабельный каталог**. Пользователь может найти что хочет за несколько секунд. Это та точка где магазин начинает реально конкурировать с "просто скачать с GitHub" — потому что у GitHub нет нашего поиска по AHK-метаданным.
