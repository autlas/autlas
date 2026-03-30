# Zustand Refactor Checklist

## Кусок 1: expandedFolders → store
- [ ] Перенести expandedFolders из useScriptTree в useTreeStore
- [ ] TreeNodeRenderer читает из store через селектор
- [ ] Тест: лог `[Tree] render:` — при клике на папку рендерится только она, не все 30
- [ ] Тест: expand/collapse анимация работает, display:none работает

## Кусок 2: focusedPath + isVimMode → store
- [ ] Перенести из useScriptTree в store
- [ ] ScriptRow/TreeNodeRenderer читают через селектор
- [ ] Тест: j/k навигация — в логах рендерятся только 2 строки (старый и новый фокус)
- [ ] Тест: hover меняет фокус, vim toggle работает

## Кусок 3: pendingScripts → store
- [ ] Перенести из useScriptTree в store
- [ ] Убрать scriptActionsRef/onExposeActions костыль из App.tsx
- [ ] ScriptDetailPanel читает pending из store напрямую
- [ ] Тест: запуск из деталки — pending виден в дереве мгновенно
- [ ] Тест: запуск из дерева — pending виден в деталке мгновенно

## Кусок 4: selectedPath + detailPinned + contextMenu → store
- [ ] Убрать из App.tsx, читать из store
- [ ] Тест: деталка открывается/закрывается из tree/tiles/list
- [ ] Тест: pin/unpin, Escape, контекстное меню

## Кусок 5: editingScript + isDragging + showHidden + removingTags → store
- [ ] Перенести остатки
- [ ] TreeContext остаётся только для callbacks и refs
- [ ] Тест: добавление/удаление тегов, drag & drop, hidden folders
- [ ] Финальный тест: полный прогон всех функций

## Логи для тестов
- `[Tree] render: FolderName` — в TreeNodeRenderer, убрать после рефактора
- `[ScriptRow] render: filename` — добавить временно в ScriptRow для куска 2-3
