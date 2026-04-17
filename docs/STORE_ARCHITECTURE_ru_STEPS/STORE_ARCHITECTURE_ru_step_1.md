# Этап 1 — Hardcoded каталог + новый таб "Store"

## Цель

Появляется новая вкладка "Store" в сайдбаре. При клике открывается экран магазина с 5 захардкоженными в коде скриптами в виде красивых карточек. Кнопка "Install" есть, но пока ничего не делает.

После этого этапа у нас есть **визуальный каркас магазина** на который дальше будет нарастать вся функциональность.

## Что должно работать в конце этапа

- В сайдбаре между пользовательскими тегами и Settings появляется пункт "Store" с иконкой магазина
- Клик переключает основную область на экран магазина
- На экране — заголовок "Store" и сетка/список из 5 карточек скриптов
- Каждая карточка показывает: иконку (заглушку), название, автора, краткое описание, кнопку "Install"
- Стилистика — glassmorphism как в остальном приложении
- Можно вернуться обратно на любой другой таб (Hub, All, теги) и магазин корректно скрывается

## Что НЕ делаем на этом этапе

- Не качаем ничего с GitHub
- Не сохраняем ничего в БД
- Кнопка Install не делает ничего (ну или показывает toast "coming soon")
- Нет поиска, нет фильтров, нет деталки скрипта
- Нет проверки что скрипт уже установлен
- Нет навигации внутри магазина (browse/detail/installed)

## Файлы которые создаём

```
tauri_app/src/
  store/
    useMarketplaceStore.ts          ← новый Zustand store
  components/
    marketplace/
      MarketplaceView.tsx           ← корневой компонент магазина
      CatalogCard.tsx               ← карточка одного скрипта
  data/
    mockCatalog.ts                  ← хардкод 5 скриптов
```

## Файлы которые трогаем

```
tauri_app/src/
  hooks/useNavigation.ts            ← добавить "store" в типы viewMode
  components/Sidebar.tsx            ← добавить пункт Store в навигацию
  App.tsx                           ← добавить рендер MarketplaceView когда viewMode === "store"
  locales/en/translation.json       ← ключи для UI магазина
  locales/ru/translation.json       ← русские переводы
```

## Структура данных (TypeScript)

В `useMarketplaceStore.ts` определяем минимальный тип карточки:

```typescript
export interface CatalogScript {
  id: string;
  name: string;
  description: string;
  author: string;
  ahkVersion: "v1" | "v2";
  category: string;
}

interface MarketplaceStore {
  items: CatalogScript[];
}
```

В `mockCatalog.ts` — массив из 5 объектов. Это могут быть выдуманные скрипты:

```typescript
export const MOCK_CATALOG: CatalogScript[] = [
  {
    id: "window-snapper",
    name: "Window Snapper",
    description: "Привязка окон к четвертям экрана горячими клавишами",
    author: "alexkoz",
    ahkVersion: "v2",
    category: "productivity"
  },
  // ... ещё 4 скрипта
];
```

В Zustand store просто инициализируем `items: MOCK_CATALOG`. Никаких setter-ов пока не нужно.

## Интеграция с навигацией

В `useNavigation.ts` сейчас есть тип `viewMode: "tree" | "hub" | "settings"`. Расширяем до `"tree" | "hub" | "settings" | "store"`. Добавляем обработку клика на новый таб.

В `Sidebar.tsx` — найти место где рендерятся кнопки навигации (Hub, All, Untagged...) и добавить ещё одну кнопку Store. Иконку взять из существующих Phosphor icons (`Storefront` или `ShoppingBag`).

В `App.tsx` — где сейчас условный рендер `viewMode === "hub" ? <ScriptGridView /> : <ScriptTree />` — добавить ветку для `"store"`:

```tsx
{viewMode === "store" ? (
  <MarketplaceView />
) : viewMode === "hub" ? (
  <ScriptGridView ... />
) : (
  <ScriptTree ... />
)}
```

## UI компонентов

### MarketplaceView.tsx

```tsx
export function MarketplaceView() {
  const items = useMarketplaceStore(s => s.items);

  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Store</h1>
      <div className="space-y-3">
        {items.map(item => (
          <CatalogCard key={item.id} script={item} />
        ))}
      </div>
    </div>
  );
}
```

Простая вертикальная колонка карточек. Никакого grid пока — list layout.

### CatalogCard.tsx

```tsx
export function CatalogCard({ script }: { script: CatalogScript }) {
  return (
    <div className="
      flex items-center gap-4 p-4 rounded-xl
      bg-white/5 backdrop-blur-xl border border-white/8
      hover:bg-white/10 hover:border-white/15 transition-all
    ">
      {/* Иконка-заглушка */}
      <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-xl">
        {script.name[0]}
      </div>

      {/* Текстовая часть */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white/90">{script.name}</div>
        <div className="text-xs text-white/50">
          by {script.author} · AHK {script.ahkVersion}
        </div>
        <div className="text-sm text-white/70 truncate mt-1">
          {script.description}
        </div>
      </div>

      {/* Install кнопка */}
      <button
        onClick={() => toast.info("Установка появится на этапе 3")}
        className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium"
      >
        Install
      </button>
    </div>
  );
}
```

## Локализация

В `translation.json` обоих локалей добавить:
- `store.title` — "Store" / "Магазин"
- `store.install` — "Install" / "Установить"
- `store.coming_soon` — "Coming soon" / "Скоро будет"
- `sidebar.store` — пункт меню

## Тестирование

Что проверяем руками после реализации:

1. Запустить `npm run tauri dev`
2. Видна ли иконка Store в сайдбаре между тегами и Settings
3. Клик по Store открывает экран магазина
4. На экране 5 карточек, выглядят как остальной UI (glassmorphism)
5. Клик на кнопку Install показывает toast "Установка появится на этапе 3"
6. Клик на любой другой таб (Hub, All, тег) корректно уводит из магазина
7. Возврат на Store сохраняет состояние (всё на месте)
8. Переключение языка EN/RU меняет надписи в магазине

## Что делает этот этап ценным сам по себе

Даже остановившись здесь, у тебя в приложении есть **визуально завершённый раздел** который можно показать. Понятно где будет магазин, как он выглядит, как интегрируется с остальной навигацией. Все следующие этапы — это наполнение этого каркаса реальными данными и логикой, без переделки UI.
