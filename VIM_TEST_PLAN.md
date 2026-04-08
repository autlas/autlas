# VIM Test Plan

Детальный мануальный прогон vim-навигации, tag picker, сортировки, Esc-цепочки и прочего.

## Подготовка

1. Открой приложение.
2. Открой DevTools консоль (Ctrl+Shift+I).
3. В консоли — отфильтруй по `[vim]`, `[tree]`, `[scroll]`, `[sort]`, `[cheatsheet]`, `[tab]`, `[vim-mode]` чтобы видеть только релевантное.
4. Чтобы отключить логи — в консоли: `localStorage.setItem('ahk_vim_debug', 'false')` и перезагрузи.

Формат шагов: каждый шаг = **действие** + **ожидание** + **лог**. После каждой фазы кидай выхлоп консоли — я сверю.

---

## Фаза 1: Монтирование и первичный gate

### Step 1.1 — Холодный старт
**Действие**: запусти приложение, открой консоль, перезагрузи (Ctrl+R).

**Ожидание**: видно mount одного или нескольких ScriptTree инстансов (по одному на посещённый tag tab), один из них активный.

**Лог**:
```
[tree] mount filterTag=(all) isActive=true viewMode=tree
[vim] mount: useVimHotkeys active {viewMode: 'tree', visibleItems: <N>}
[vim] gate: hk=true (isActive=true modalOpen=false vimEnabled=true)
[vim-mode] EXIT
[cheatsheet] CLOSE
```

### Step 1.2 — Переключение на другой tag tab
**Действие**: кликни на другой tag в сайдбаре (или `Shift+Alt+J`).

**Ожидание**: предыдущий ScriptTree unmount-ится или становится inactive, новый монтируется и активируется.

**Лог**:
```
[tab] Shift+Alt+J → all → <newTag>     (если через хоткей)
[tree] isActive=false filterTag=(all)
[vim] gate: hk=false (isActive=false ...)
[tree] mount filterTag=<newTag> isActive=true viewMode=tree
[vim] mount: useVimHotkeys active {...}
[vim] gate: hk=true ...
```

---

## Фаза 2: Базовая навигация (tree view)

### Step 2.1 — Первое движение
**Действие**: `j`.

**Ожидание**: focus появляется на первом элементе, индиго-подсветка, vim-mode ON, курсор исчезает.

**Лог**:
```
[vim] key: j → moveFocus(down, 1 ) viewMode=tree nav=hjkl
[vim-mode] ENTER (cursor hidden)
[scroll] {source: 'folderRefs' or 'query', viewMode: 'tree', delta: <N>, containerScrollTop: 0}
```

### Step 2.2 — Навигация вниз на 10 шагов
**Действие**: `jjjjjjjjjj`.

**Ожидание**: focus двигается вниз, контейнер постепенно скроллится, focused всегда в 120px от нижнего края.

**Лог**: 10 записей `[vim] key: j...` + 10 `[scroll]` с ненулевой delta.

### Step 2.3 — Навигация вверх
**Действие**: `kkkkk`.

**Ожидание**: focus двигается вверх, скролл подстраивается.

**Лог**: 5 записей `[vim] key: k...`.

### Step 2.4 — Стрелки
**Действие**: `↓↓↑↑→←`.

**Ожидание**: то же что hjkl.

**Лог**: `[vim] key: ArrowDown`, `ArrowUp`, `ArrowRight`, `ArrowLeft`.

### Step 2.5 — Раскрытие/сворачивание папки
**Действие**: фокус на папке, нажми `Enter`.

**Ожидание**: папка раскрывается/сворачивается.

**Лог**:
```
[vim] key: Enter → toggleFolder <path>
```

---

## Фаза 3: gg / G

### Step 3.1 — gg
**Действие**: нажми `g` затем быстро `g` (в течение 500мс).

**Ожидание**: focus прыгает в начало списка, мгновенный скролл.

**Лог**:
```
[vim] key: g (first tap, arming chord)
[vim] key: gg (double-g, <N>ms) → scroll to top <path>
[scroll] {...}
```

### Step 3.2 — G (Shift+G)
**Действие**: `Shift+G`.

**Ожидание**: focus прыгает в конец.

**Лог**:
```
[vim] key: G → scroll to bottom <path>
[scroll] {...}
```

### Step 3.3 — g без второго g
**Действие**: нажми `g`, подожди 2 секунды, ничего не делай.

**Ожидание**: ничего не происходит, таймер сброшен.

**Лог**:
```
[vim] key: g (first tap, arming chord)
```
(и всё — второй gg не должен сработать при следующем одиночном нажатии)

---

## Фаза 4: Действия на focused скрипт

### Step 4.1 — Run/Stop
**Действие**: фокус на скрипте, `Enter`.

**Ожидание**: запуск скрипта (зелёная точка).

**Лог**:
```
[vim] key: Enter → handleToggle <filename> running=false
```

### Step 4.2 — Restart running
**Действие**: на running скрипте нажми `r`.

**Ожидание**: скрипт рестартится.

**Лог**:
```
[vim] key: r → handleRestart <filename>
```

### Step 4.3 — Restart non-running (тост)
**Действие**: на не-running скрипте нажми `r`.

**Ожидание**: тост "Скрипт не запущен — нажмите Enter, чтобы запустить".

**Лог**:
```
[vim] key: r → TOAST (not running) <filename>
```

### Step 4.4 — Interface (i)
**Действие**: запусти скрипт с GUI, фокус на нём, `i`.

**Ожидание**: окно GUI выходит на передний план.

**Лог**:
```
[vim] key: i → onShowUI <filename>
```

### Step 4.5 — i на скрипте без GUI
**Действие**: фокус на running скрипте БЕЗ GUI, `i`.

**Ожидание**: ничего не происходит.

**Лог**:
```
[vim] key: i → IGNORED (focused script not running or has no UI)
```

### Step 4.6 — Show in folder (f)
**Действие**: фокус на скрипте, `f`.

**Ожидание**: открывается Проводник с выделенным файлом.

**Лог**:
```
[vim] key: f → open_in_explorer <path>
```

### Step 4.7 — f на папке (в tree view)
**Действие**: фокус на папке, `f`.

**Ожидание**: открывается Проводник на папке.

**Лог**:
```
[vim] key: f → open_in_explorer <folder path>
```

### Step 4.8 — Open with (o)
**Действие**: `o`.

**Ожидание**: диалог "Open with".

**Лог**:
```
[vim] key: o → open_with <path>
```

### Step 4.9 — Edit (e)
**Действие**: `e`.

**Ожидание**: скрипт открывается в редакторе.

**Лог**:
```
[vim] key: e → edit_script <path>
```

### Step 4.10 — Space
**Действие**: `Space` на скрипте.

**Ожидание**: открывается detail panel справа.

**Лог**:
```
[vim] key: Space → onSelectScript (open detail) <filename>
```

---

## Фаза 5: Tag picker (t)

### Step 5.1 — Открытие picker
**Действие**: фокус на скрипте, `t`.

**Ожидание**: рядом со скриптом появляется TagPickerPopover.

**Лог**:
```
[vim] key: t → startEditing <filename>
```

### Step 5.2 — Закрытие picker (Esc)
**Действие**: при открытом picker — `Esc`.

**Ожидание**: picker закрывается.

**Лог**:
```
[vim] key: Esc → stopEditing (tag picker, priority 3)
```

### Step 5.3 — t на ru-раскладке
**Действие**: переключи раскладку на русскую, фокус на скрипте, нажми `е` (физическая клавиша T).

**Ожидание**: picker открывается.

**Лог**:
```
[vim] key: t → startEditing <filename>
```

### Step 5.4 — t на folder (в tree)
**Действие**: фокус на папке, `t`.

**Ожидание**: ничего не происходит.

**Лог**:
```
[vim] key: t → IGNORED (focused is a folder)
```

### Step 5.5 — t в hub (scoped key)
**Действие**: перейди на hub tab (или tag где один скрипт в нескольких тегах), открой tile view, фокус на карточке, `t`.

**Ожидание**: picker открывается именно на той карточке, не на всех дубликатах.

**Лог**:
```
[vim] key: t → setEditingScript(scoped hub key) <tag>::<path>
```

---

## Фаза 6: View cycling

### Step 6.1 — q: tree → tiles
**Действие**: в tree view нажми `q`.

**Ожидание**: переключается на tiles.

**Лог**:
```
[vim] key: q → cycle view tree → tiles
[tree] viewMode=tiles
```

### Step 6.2 — q: tiles → list
**Действие**: `q`.

**Лог**:
```
[vim] key: q → cycle view tiles → list
[tree] viewMode=list
```

### Step 6.3 — q: list → tree
**Действие**: `q`.

**Лог**:
```
[vim] key: q → cycle view list → tree
[tree] viewMode=tree
```

### Step 6.4 — Навигация в tiles
**Действие**: переключись в tiles (`q`), `jjj`.

**Ожидание**: focus двигается, скролл работает.

**Лог**: `[vim] key: j → moveFocus(down, <N>) viewMode=tiles nav=hjkl` + `[scroll]`.

### Step 6.5 — Навигация в list
**Действие**: переключись в list (`q`), `jjj`.

**Лог**: то же с `viewMode=list`.

### Step 6.6 — После qqq возвращение в tree — скролл скриптов
**Действие**: `q q q`, теперь снова tree. Нажми `j` несколько раз.

**Ожидание**: скролл работает **для скриптов, а не только папок** (регрессия прошлого бага).

**Лог**: `[scroll] {source: 'query', viewMode: 'tree', delta: <non-zero>, ...}` для скриптов.

---

## Фаза 7: Sort dropdown (s)

### Step 7.1 — Открытие
**Действие**: `s`.

**Ожидание**: выпадашка открывается, фокус на текущей сортировке.

**Лог**:
```
[sort] key: s → OPEN dropdown
[vim] gate: hk=false (... modalOpen=true ...)
```

### Step 7.2 — j/k внутри
**Действие**: при открытой выпадашке — `j j j k`.

**Ожидание**: focus двигается вниз/вверх, цикличный.

**Лог**:
```
[sort] key: j/↓ → focus next
[sort] key: j/↓ → focus next
[sort] key: j/↓ → focus next
[sort] key: k/↑ → focus prev
```
(и НЕ должно быть `[vim] key: j → moveFocus` — vim заглушён через `modalOpen`)

### Step 7.3 — j/k на ru-раскладке
**Действие**: при открытой выпадашке — переключи на ru, нажми `о` (физическая J) и `л` (физическая K).

**Ожидание**: работает через `e.code === 'KeyJ'/'KeyK'`.

**Лог**: те же `[sort] key: j/↓ → ...`.

### Step 7.4 — Стрелки
**Действие**: `↓↑`.

**Лог**: `[sort] key: j/↓`, `[sort] key: k/↑`.

### Step 7.5 — Apply (Enter)
**Действие**: `Enter`.

**Ожидание**: сортировка применяется, выпадашка закрывается.

**Лог**:
```
[sort] key: Enter/Space → apply <sortId>
[vim] gate: hk=true ...
```

### Step 7.6 — Apply (Space)
**Действие**: `s`, выбери `j`, `Space`.

**Лог**:
```
[sort] key: s → OPEN dropdown
[sort] key: j/↓ → focus next
[sort] key: Enter/Space → apply <sortId>
```

### Step 7.7 — Close (s)
**Действие**: `s` (открыть), `s` (закрыть).

**Лог**:
```
[sort] key: s → OPEN dropdown
[sort] key: Esc/s → close
```

### Step 7.8 — Close (Esc)
**Действие**: `s`, `Esc`.

**Лог**:
```
[sort] key: s → OPEN dropdown
[sort] key: Esc/s → close
```

---

## Фаза 8: Search (gi / Ctrl+F)

### Step 8.1 — gi (chord)
**Действие**: `g` затем быстро `i` (в течение 1с).

**Ожидание**: поле поиска получает фокус.

**Лог**:
```
[vim] key: g (first tap, arming chord)
[vim] key: gi (g-chord, <N>ms) → focus search
```

### Step 8.2 — Ctrl+F
**Действие**: `Ctrl+F` из любого места в дереве.

**Ожидание**: фокус на поиске.

**Лог**:
```
[vim] key: Ctrl+F → focus search
```

### Step 8.3 — gi когда поиск свёрнут в кнопку
**Действие**: сузь окно так чтобы поиск свернулся в иконку, затем `gi`.

**Ожидание**: кнопка кликается, поиск разворачивается и получает фокус.

**Лог**: те же `[vim] key: gi ...`.

### Step 8.4 — Esc из поиска
**Действие**: фокус в поиске, `Esc`.

**Ожидание**: поле теряет фокус (blur), но query остаётся.

**Лог**:
```
[vim] key: Esc → blur search (priority 4)
```

### Step 8.5 — ? не срабатывает в поиске
**Действие**: фокус в поиске, нажми `?`.

**Ожидание**: cheatsheet НЕ открывается, `?` печатается в инпут.

**Лог**:
```
[vim] key: ? → IGNORED (focus in search input)
```

---

## Фаза 9: CheatSheet (?)

### Step 9.1 — Открытие
**Действие**: `?` (вне поиска).

**Ожидание**: CheatSheet открывается.

**Лог**:
```
[vim] key: ? → toggle CheatSheet OPEN
[cheatsheet] OPEN
```

### Step 9.2 — Закрытие (?)
**Действие**: при открытом — `?`.

**Лог**:
```
[vim] key: ? → toggle CheatSheet CLOSE
[cheatsheet] CLOSE
```

### Step 9.3 — Закрытие (Esc)
**Действие**: `?` затем `Esc`.

**Лог**:
```
[vim] key: ? → toggle CheatSheet OPEN
[cheatsheet] OPEN
[cheatsheet] global Esc → close
[cheatsheet] CLOSE
```

### Step 9.4 — Открытие из Settings
**Действие**: перейди на tab Settings, найди "Vim" секцию, нажми кнопку "Открыть шпаргалку".

**Ожидание**: открывается **один** CheatSheet (не два).

**Лог**:
```
[cheatsheet] open (via ahk-open-cheatsheet event — probably Settings button)
[cheatsheet] OPEN
```

---

## Фаза 10: Esc priority chain

Цель: проверить что Esc закрывает по одному слою.

### Step 10.1 — Открой всё сразу
**Действие**:
1. Открой скрипт (`Space`) — detail panel open
2. Открой tag picker (`t`)
3. Открой cheatsheet (`?`)

### Step 10.2 — Esc 1: закрывает cheatsheet
**Действие**: `Esc`.

**Ожидание**: cheatsheet закрылся, tag picker и detail panel на месте.

**Лог**:
```
[cheatsheet] global Esc → close
[cheatsheet] CLOSE
```

### Step 10.3 — Esc 2: закрывает tag picker
**Действие**: `Esc`.

**Лог**:
```
[vim] key: Esc → stopEditing (tag picker, priority 3)
```

### Step 10.4 — Esc 3: закрывает detail panel
**Действие**: `Esc`.

**Лог**:
```
[vim] key: Esc → close detail panel (priority 5)
```

### Step 10.5 — Esc 4: выход из vim mode
**Действие**: `Esc`.

**Лог**:
```
[vim] key: Esc → exit vim mode + clear focus (priority 6)
[vim-mode] EXIT
```

### Step 10.6 — Esc в sort dropdown + cheatsheet
**Действие**: `s` (открыть sort), `?` (открыть cheatsheet, но пока sort открыт это может не получиться — попробуй наоборот: `?` потом `s`), затем `Esc`.

**Ожидание**: cheatsheet закрывается первым, sort остаётся.

**Лог**:
```
[cheatsheet] global Esc → close        (или)
[sort] Esc → FALL-THROUGH (cheatsheet priority)
```

---

## Фаза 11: Detail panel (p)

### Step 11.1 — Открой detail
**Действие**: `Space` на скрипте.

**Ожидание**: панель открыта.

### Step 11.2 — p pin
**Действие**: `p`.

**Ожидание**: панель пинится (иконка pin меняется).

**Лог**:
```
[vim] key: p → onDetailPinToggle
```

### Step 11.3 — p unpin
**Действие**: `p`.

**Лог**: то же, панель анпинится.

### Step 11.4 — p когда детали закрыты
**Действие**: закрой панель (`Esc`), нажми `p`.

**Ожидание**: ничего.

**Лог**:
```
[vim] key: p → IGNORED (detail panel not open)
```

---

## Фаза 12: Vim-режим визуально

### Step 12.1 — Курсор скрыт
**Действие**: войди в vim mode (`gg` или `j`), наведи курсор на скрипт.

**Ожидание**: курсор невидим, hover-эффект (подсветка) не срабатывает.

**Лог**:
```
[vim-mode] ENTER (cursor hidden)
```

### Step 12.2 — Выход при движении мыши
**Действие**: подвигай мышкой.

**Ожидание**: курсор возвращается, vim mode OFF.

**Лог**:
```
[vim-mode] mousemove → exit
[vim-mode] EXIT
```

### Step 12.3 — Повторный вход в vim
**Действие**: снова `j`.

**Ожидание**: всё работает как раньше (mousemove листенер перевешивается).

**Лог**:
```
[vim] key: j → moveFocus(down, 1 ) ...
[vim-mode] ENTER (cursor hidden)
```

---

## Фаза 13: Переключение табов

### Step 13.1 — Shift+Alt+J
**Действие**: `Shift+Alt+J`.

**Лог**:
```
[tab] Shift+Alt+J → <current> → <next>
[tree] isActive=false ...
[tree] isActive=true filterTag=<next>
[vim] gate: hk=true ...
```

### Step 13.2 — Shift+Alt+K
**Действие**: `Shift+Alt+K`.

**Лог**: `[tab] Shift+Alt+K → ...`.

### Step 13.3 — j/k работают в новом табе
**Действие**: в новом табе — `jjj`.

**Ожидание**: focus двигается, scroll работает.

**Лог**: `[vim] key: j ...` + `[scroll] ...`.

### Step 13.4 — Регрессия дубликатов id
**Действие**: посети 3-4 таба (чтобы много ScriptTree осталось в DOM), вернись на первый, `jjj`.

**Ожидание**: scroll работает (не возвращает элемент из другого инстанса).

**Лог**: `[scroll] {source: 'query', ...}` с ненулевой delta.

---

## Фаза 14: Settings → Vim

### Step 14.1 — Отключение vim
**Действие**: перейди в Settings → Vim секция → toggle off.

**Ожидание**: `ahk-vim-enabled-changed` event триггерится, gate переключается.

**Лог**:
```
[vim] gate: hk=false (... vimEnabled=false)
```

### Step 14.2 — Хоткеи не работают
**Действие**: попробуй `j`, `k`, `r`, `t`, `q`, `s`, `?`, `gi`, `gg`.

**Ожидание**: ничего из них не срабатывает (кроме возможно `?` и `s` в sort dropdown — проверим).

**Лог**: НЕТ `[vim] key: ...` записей.

### Step 14.3 — Esc работает
**Действие**: открой detail (кликом мыши), `Esc`.

**Ожидание**: панель закрывается (Esc завязан только на `isActive`).

**Лог**:
```
[vim] key: Esc → close detail panel (priority 5)
```

### Step 14.4 — Включение обратно
**Действие**: toggle on.

**Лог**:
```
[vim] gate: hk=true ...
```

### Step 14.5 — hjkl/jk режим
**Действие**: в Vim секции переключи на "jk", перейди в tiles view, попробуй `h`/`l`.

**Ожидание**: `h`/`l` игнорируются.

**Лог**:
```
[vim] key: h → IGNORED (jk-mode in grid view)
[vim] key: l → IGNORED (jk-mode in grid view)
```

### Step 14.6 — jk в tree
**Действие**: в tree при jk-режиме — `h`/`l`.

**Ожидание**: работают (в tree h/l всегда).

**Лог**: `[vim] key: h → moveFocus(left)`.

---

## Фаза 15: Регрессии скролла

### Step 15.1 — Скрипты в глубокой папке
**Действие**: tree view, раскрой глубоко вложенную папку (например 3+ уровня), нажми `j` чтобы попасть на скрипт внутри.

**Ожидание**: scroll срабатывает, focus виден.

**Лог**:
```
[scroll] {source: 'query', viewMode: 'tree', delta: <non-zero>, ...}
```

### Step 15.2 — BAIL zero rect
**Действие**: попробуй навигацию когда фокусируется элемент в свёрнутой папке (не должно случаться, visibleItems должны фильтровать).

**Ожидание**: НЕ должно быть `[scroll] BAIL zero rect (element hidden)`.

### Step 15.3 — tiles после q-цикла
**Действие**: `q q` (tree → tiles → list), `j`.

**Лог**: `[scroll]` с ненулевой delta, `source: 'query'`.

### Step 15.4 — Windows пути с пробелами и русскими буквами
**Действие**: если есть, наведись на скрипт с пробелами или русскими буквами в пути, `j`.

**Ожидание**: scroll работает (CSS.escape обрабатывает).

**Лог**: `[scroll] ...` с ненулевой delta.

---

## Фаза 16: Context menu и тултипы

### Step 16.1 — Тултипы шорткатов
**Действие**: наведи мышь на:
- кнопки Tree/Tiles/List → должны показать `q`
- кнопку поиска (когда свёрнут в иконку) → `g` `i`
- кнопку Play/Stop → `Enter`
- Restart → `r`
- Add tag → `t`
- Interface (running script) → `i`
- В детали: Pin → `p`, Close → `Esc`

**Ожидание**: на каждой кнопке в тултипе видны kbd-чипы.

**Проверка визуальная** — логов нет.

### Step 16.2 — Context menu
**Действие**: ПКМ на скрипте.

**Ожидание**: в меню рядом с Show in folder / Edit / Open with видны kbd-чипы `f` / `e` / `o`.

---

## После прохождения

1. Экспортируй логи из консоли (правый клик → Save as).
2. Скинь мне, я сверю что каждый шаг дал правильный лог.
3. Если где-то есть расхождение или лишнее/недостающее — я починю.

---

## Быстрые команды консоли

- Включить логи: `localStorage.removeItem('ahk_vim_debug')` + reload
- Выключить логи: `localStorage.setItem('ahk_vim_debug', 'false')` + reload
- Проверить текущий gate: посмотри последний `[vim] gate:` лог
- Проверить сколько ScriptTree инстансов: ищи все `[tree] mount` записи без `[tree] unmount`
