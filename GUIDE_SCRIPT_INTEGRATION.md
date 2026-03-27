# Интеграция скриптов в AHK Manager (Руководство разработчика)

AHK Manager умеет централизованно управлять скриптами, позволяя пользователю вызывать интерфейс настроек любого скрипта прямо из программы. Это избавляет от необходимости "зашивать" глобальные горячие клавиши для открытия настроек в каждом отдельном скрипте.

## Принцип работы
Когда пользователь нажимает кнопку **"Interface"** (Показать UI) в AHK Manager, менеджер находит процесс конкретного скрипта и посылает его главному скрытому окну системное сообщение (`PostMessage`) с кодом `0x0401` (что соответствует `WM_USER + 1`).

Ваш скрипт просто должен "слушать" это сообщение и в ответ открывать свое GUI-окно.

---

## Как добавить поддержку в свой AHK скрипт

### AutoHotkey v2 (Рекомендуется)

Здесь приведен шаблон идеального скрипта под AHK Manager. Он включает скрытие/показ GUI по клику из менеджера, а также переменную состояния `ScriptEnabled` для отключения функционала без закрытия самого процесса.

```autohotkey
#Requires AutoHotkey v2.0
#SingleInstance Force

; 1. Глобальная переменная состояния (включен/выключен)
global ScriptEnabled := true

; 2. Регистрация слушателя сообщений от AHK Manager
; Код 0x0401 = WM_USER + 1
OnMessage(0x0401, (wParam, lParam, msg, hwnd) => ShowSettings())

; 3. GUI переменная
global SettingsGui := ""

ShowSettings() {
    global SettingsGui, ScriptEnabled
    
    ; Если окно уже существует, просто показываем его
    if IsObject(SettingsGui) {
        SettingsGui.Show()
        return
    }

    ; Создаем новое окно
    SettingsGui := Gui("+AlwaysOnTop", "Настройки моего скрипта")
    SettingsGui.OnEvent("Close", (*) => SettingsGui.Hide()) ; Скрываем, а не уничтожаем при крестике

    ; Чекбокс, управляющий активностью скрипта
    chk := SettingsGui.Add("Checkbox", "Checked" (ScriptEnabled ? 1 : 0), "Скрипт активен")
    chk.OnEvent("Click", (ctrl, *) => ToggleScript(ctrl.Value))

    SettingsGui.Add("Button", "w100", "Закрыть").OnEvent("Click", (*) => SettingsGui.Hide())

    SettingsGui.Show("w200 h100")
}

ToggleScript(val) {
    global ScriptEnabled := val
}

; -------------------------------------------------------------
; ВАЖНО: Все ваши горячие клавиши должны быть обернуты в #HotIf
; -------------------------------------------------------------
#HotIf ScriptEnabled

F1:: MsgBox("Скрипт работает!")

; Если нужны сложные условия, комбинируйте их так:
; #HotIf ScriptEnabled and GetKeyState("Ctrl", "P")

#HotIf ; Закрывающий тег блока хоткеев
```

### AutoHotkey v1 (Legacy)

Если вы пишете скрипты на первой версии, логика абсолютно та же, но используется совместимый синтаксис:

```autohotkey
#SingleInstance Force

; Глобальная переменная
global ScriptEnabled := 1

; Подписка на сообщение от AHK Manager
OnMessage(0x0401, "ShowSettings")

ShowSettings() {
    global ScriptEnabled
    Gui, Settings:New, +AlwaysOnTop, Настройки моего скрипта
    
    ; Задаем состояние чекбокса в зависимости от переменной
    chkState := ScriptEnabled ? "Checked" : ""
    Gui, Settings:Add, Checkbox, vScriptEnabled %chkState% gUpdateState, Скрипт активен
    
    Gui, Settings:Add, Button, gCloseSettings, Закрыть
    Gui, Settings:Show, w200 h100
    return
}

UpdateState:
    Gui, Settings:Submit, NoHide
    return

CloseSettings:
SettingsGuiClose:
    Gui, Settings:Cancel
    return

; -------------------------------------------------------------
; Хоткеи внутри блока #If
; -------------------------------------------------------------
#If ScriptEnabled

F1:: MsgBox, Скрипт работает!

#If
```

---

## Рекомендации и частые ошибки

1. **Не используйте `ExitApp` на крестик окна!** 
   Если пользователь закроет окно настроек, скрипт должен продолжить работу в фоне. Используйте `Gui.Hide()` (v2) или `Gui, Cancel` (v1).
2. **Комбинируйте условия (AHK v2)**
   Так как директивы `#HotIf` не наслаиваются (одна переопределяет другую), если у вас есть сложные хоткеи с проверкой окон или клавиш, всегда добавляйте статус: 
   `#HotIf ScriptEnabled and WinActive("ahk_class Notepad")`
3. **Глобальные переменные**
   В AHK v2 функции по умолчанию работают с локальными переменными. Убедитесь, что вы объявляете `global ScriptEnabled` в функции, где вы меняете статус чекбокса.
