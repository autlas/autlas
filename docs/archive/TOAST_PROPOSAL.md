# Toast System — что предлагаю изменить и добавить

Отталкиваюсь от `TOAST_UX_GUIDE.md` и текущего состояния `appToast` /
`AppToaster` / call-сайтов в `App.tsx` и `useVimHotkeys.tsx`.

Список ранжирован: сверху — критичное, снизу — приятные мелочи.

---

## 🔴 Критичное (фиксить в первую очередь)

### 1. Errors не должны автоисчезать

**Сейчас:** `appToast.error(...)` использует `duration` по умолчанию 3000мс
из `render()`. Единственный реальный error-кейс (`everything_toast_not_installed`)
жив только потому, что мы вручную передаём `Infinity`.

**Надо:** в `render()` для `kind === "error"` дефолтить `duration: Infinity`.
А ещё — добавить кнопку Close по умолчанию, иначе persistent-тост невозможно
закрыть кроме как полностью убить ID руками.

**Почему:** WCAG 2.2.3 fail + WAI-ARIA Alert pattern + top-антипаттерн (Smashing/NNG).

---

### 2. Нет ARIA-ролей

**Сейчас:** `<Toaster theme="dark" />` без `toastOptions.ariaProps`. Sonner по
дефолту ставит `role="status" aria-live="polite"` для всех — но это **неправильно
для error**, который должен быть `role="alert" aria-live="assertive"`.

**Надо:** в `render()` для error прокидывать `important: true` в Sonner-опциях
(он перекидывает на `assertive`), или вручную ставить `role="alert"` в JSX
custom-тоста. Лучше второе — у нас всё равно `toast.custom`.

```tsx
<div role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"} ...>
```

---

### 3. Нет иконок — только цветная точка

**Сейчас:** все 4 типа отличаются только цветом точки (зелёная/оранжевая/
красная/синяя). Это нарушает **WCAG 1.4.1 Use of Color** и общее правило MD/Primer/Atlassian
«цвет — не единственный сигнал».

**Надо:** добавить per-kind иконку слева вместо или вместе с точкой.
- ✓ success → CheckCircleIcon
- ⚠ warning → WarningIcon
- ✕ error → AlertCircleIcon
- ℹ info → InfoIcon

В `Icons.tsx` уже есть похожие. Точку можно оставить как accent внутри иконки или убрать.

---

### 4. Кнопка Close на warning/error

**Сейчас:** только orphan и everything имеют кнопки в `right`-слоте. Остальные
тосты (особенно warning/error) не закрываются явно.

**Надо:** автоматически показывать close-кнопку (×) для `warning` и `error`,
если `right` слот не задан. Для `success`/`info` — опционально.

---

## 🟠 Важное

### 5. Esc для закрытия сфокусированного тоста + Alt+T для фокуса региона

**Сейчас:** тосты закрываются только мышью. Клавиатуры нет.

**Надо:**
- Глобальный хоткей `Alt+T` → вызвать `focusToast()` (Sonner экспонирует
  через props `<Toaster hotkey={['altKey', 'KeyT']} />`).
- В фокусированном тосте `Esc` → dismiss.

Это часть нашей vim-философии — клавиатура должна работать везде.

---

### 6. Дедупликация одинаковых сообщений

**Сейчас:** уже частично работает через `id` (например `id: "vim-hint"`),
но если выстрелить два разных текста с одним id — второй просто заменит первый
без счётчика.

**Надо:** обернуть `render()` так, чтобы:
- одинаковый текст в течение 2с → инкрементить счётчик «×2», «×3».
- разные тексты с одним id → как сейчас (replace).

Это не на Sonner — над ним. Map<id, {text, count, timer}>.

---

### 7. Promise / progress тост для долгих операций

**Сейчас:** scan показывает два разных тоста: `scan-progress` (info, pulse)
во время и `scan_complete` (success) в конце. Это работает, но не идиоматично.

**Надо:** добавить `appToast.promise(promise, { loading, success, error })`
поверх `toast.promise` от Sonner. Use case'ы: scan, bulk tag rename, restart-all,
будущий импорт/экспорт настроек.

```ts
appToast.promise(scanScripts(), {
  loading: t("scan.in_progress"),
  success: (n) => t("scan.complete", { n }),
  error: (e) => t("scan.failed", { e }),
});
```

---

### 8. `prefers-reduced-motion`

**Сейчас:** Sonner анимирует scale+slide. Юзеры с `prefers-reduced-motion: reduce`
получают то же самое.

**Надо:** в `<Toaster>` опции / CSS-override: при `prefers-reduced-motion` отключать
slide и scale, оставлять только opacity-переход.

---

## 🟡 Приятные улучшения

### 9. Пересмотреть `vim-hint` как warning

Все vim-подсказки (`script_not_running`, `script_has_no_ui`) сейчас warning.
Это пограничный случай: они скорее **info-with-context**, чем warning. Юзер
не сделал ошибку — он просто промахнулся хоткеем по неподходящему скрипту.

Варианты:
- Оставить warning (как сейчас) — оранжевый = «обрати внимание, действие не
  выполнено».
- Перевести в info (синий) — «для справки, ничего не сломалось».

Я бы оставил **warning**, потому что хоткей **не сработал** — это failed action,
и оранжевый передаёт это лучше нейтрального синего. Но стоит зафиксировать
правило в гайде: «failed user action из-за состояния → warning, не error».

---

### 10. Coalesce burst-событий watcher'а

**Сейчас:** `orphan-matches-found` стреляет один тост на batch. Хорошо.
Но если в будущем добавим watcher для других событий (created/deleted/modified),
надо сразу делать debounce ~500мс и summary-тост, а не поток.

**Надо:** добавить хелпер `appToast.debounced(id, msg, {window: 500})` который
накапливает счётчик и эмитит один тост в конце окна.

---

### 11. Стандартизировать `right`-слот кнопок

**Сейчас:** orphan и everything руками рендерят кнопки с почти идентичными
классами. Дублирование.

**Надо:** компонент `<ToastButton variant="primary" | "ghost">` который мы
импортируем в `right`. Или принимать `actions: { label, onClick, variant }[]`
в Opts (но MD говорит — максимум одна — давай так и оставим, через массив).

---

### 12. Промоутить «AHK не установлен» из тоста в баннер

**Сейчас:** Everything `not_installed` показывается как persistent error-тост
с кнопкой Install. По гайду §1 и §9 — это **постоянное состояние системы**,
которое должно быть **баннером** наверху окна, а не тостом.

То же самое было бы для гипотетического «AutoHotkey не найден».

**Надо:** добавить `<TopBanner />` компонент и переехать туда. Не срочно, но
концептуально правильнее.

---

### 13. Quick reference в коде

Добавить в `AppToast.tsx` JSDoc-комментарий с правилами выбора kind:

```ts
/**
 * @example
 * appToast.success("Saved")     // реакция на действие → ✓
 * appToast.warning("Not running") // failed action из-за state → ⚠
 * appToast.error("Failed to save") // операция упала → ✕
 * appToast.info("New version")    // фон, не реакция на клик → ℹ
 */
```

Чтобы при следующем добавлении тоста разработчик (читай: я) не путался.

---

## Что НЕ надо менять

- Позиция bottom-right — правильно (Fluent + Sonner default + не мешает дереву).
- Лимит 3 видимых — Sonner default уже такой.
- Pause on hover — Sonner делает из коробки.
- Glass-стиль — фирменный, оставить.
- Текущая 4-цветная таксономия (success/warning/error/info) — корректная.

---

## Предлагаемый порядок работ

1. **#1** (errors persistent) + **#3** (иконки) + **#4** (close-кнопка) — один PR, базовая корректность.
2. **#2** (ARIA) + **#8** (reduced-motion) — один PR, a11y.
3. **#5** (Esc/Alt+T) — отдельный PR, синхронно с vim-доками.
4. **#6** (дедуп) + **#10** (debounce) — один PR, новый слой над appToast.
5. **#7** (promise) — отдельный PR, инфраструктура для будущих bulk-операций.
6. **#11**, **#12**, **#13** — последняя волна полировки.
7. **#9** — обсудить и зафиксировать в гайде, кода менять не нужно.
