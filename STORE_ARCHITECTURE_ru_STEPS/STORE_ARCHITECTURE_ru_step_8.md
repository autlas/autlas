# Этап 8 — Permissions, безопасность, доверие

## Цель

Перед установкой пользователь видит **что именно** делает скрипт: лезет ли в сеть, читает ли файлы, требует ли админа. Опасные скрипты ставятся через подтверждающий диалог. Если обнаружен вредоносный скрипт — приложение может его заблокировать через blocklist.

После этого этапа закрывается главный риск магазина: установка произвольного кода с полным доступом к системе.

## Что должно работать в конце этапа

- В каждом manifest.json есть секция `permissions` с булевыми флагами
- На карточке скрипта в списке — маленький цветовой бейдж риска (зелёный/жёлтый/красный)
- На детальной странице — раздел "Permissions" с иконками и описаниями каждого разрешения
- При клике Install на скрипт уровня "dangerous" — модальный диалог подтверждения с перечислением разрешений и кнопками View Source / Cancel / Install Anyway
- Если автор помечен как "trusted" в catalog.json — диалог не показывается даже для dangerous
- В репозитории есть `blocklist.json` — список вредоносных script_id с версиями
- При запуске приложения проверяется blocklist:
  - Если установлен заблокированный скрипт → toast-предупреждение
  - Если он запущен → автоматическая остановка
  - Опция "Удалить" в предупреждении

## Что НЕ делаем на этом этапе

- Нет автоматического статического анализа AHK-кода (CI на GitHub Actions проверяет — это отдельная задача после Этапа 8)
- Нет системы доверия с tier-ами (Phase 2/3 из основного документа)
- Нет community flagging
- Нет sandboxing (невозможно для AHK)
- Нет верификации подписи скриптов (PGP/minisign)

## Расширение `manifest.json`

```json
{
  "id": "window-snapper",
  ...
  "permissions": {
    "requiresAdmin": false,
    "network": false,
    "clipboard": false,
    "registry": false,
    "shellExecute": false,
    "keyboardHook": true,
    "mouseHook": false,
    "fileSystem": false
  },
  "trustLevel": "community"
}
```

`trustLevel`: `"unverified" | "community" | "trusted" | "curated"` — пока ставится вручную мейнтейнером. По умолчанию все новые = `"unverified"`.

## Расширение `catalog.json`

Дублируем permissions в catalog для отображения бейджа без скачивания manifest:

```json
{
  "id": "window-snapper",
  "permissions": ["keyboardHook"],
  "riskLevel": "safe",
  "trustLevel": "community"
}
```

`riskLevel` высчитывается автоматически при сборке каталога:
- `safe`: только `keyboardHook`, `mouseHook`, ничего больше
- `caution`: добавляются `clipboard`, `shellExecute`, `fileSystem`, `clipboard`
- `dangerous`: есть `network`, `registry`, или `requiresAdmin`

## `blocklist.json` в корне репозитория

```json
{
  "version": 1,
  "updatedAt": "2026-04-15T12:00:00Z",
  "blocked": [
    {
      "scriptId": "malicious-clipboard",
      "versions": ["1.0.0", "1.0.1"],
      "reason": "Кража данных через WinHTTP",
      "severity": "critical",
      "action": "kill_and_warn",
      "blockedAt": "2026-04-15T12:00:00Z"
    }
  ]
}
```

`action`:
- `warn` — только предупредить пользователя
- `kill` — остановить запущенный скрипт
- `kill_and_warn` — оба

## Файлы которые создаём

```
tauri_app/src/components/marketplace/
  PermissionBadge.tsx               ← маленький цветовой индикатор для карточки
  PermissionsList.tsx               ← полный список с иконками для деталки
  TrustPromptDialog.tsx             ← модалка подтверждения для dangerous
  BlocklistAlert.tsx                ← предупреждение о заблокированном скрипте
```

## Файлы которые трогаем

```
tauri_app/src-tauri/src/
  marketplace.rs                    ← marketplace_check_blocklist,
                                      проверка trustLevel при установке

tauri_app/src/
  api.ts                            ← новый wrapper checkMarketplaceBlocklist
  store/useMarketplaceStore.ts      ← blockedScripts state
  components/marketplace/
    CatalogCard.tsx                 ← добавить PermissionBadge
    StoreDetail.tsx                 ← добавить PermissionsList
    InstallButton.tsx               ← логика подтверждения для dangerous
  App.tsx                           ← проверка blocklist при старте
```

## Категоризация разрешений

```typescript
// utils/permissions.ts
export type Permission =
  | "requiresAdmin"
  | "network"
  | "clipboard"
  | "registry"
  | "shellExecute"
  | "keyboardHook"
  | "mouseHook"
  | "fileSystem";

export type RiskLevel = "safe" | "caution" | "dangerous";

export function calculateRisk(perms: Permission[]): RiskLevel {
  const dangerous = ["network", "registry", "requiresAdmin"];
  const caution = ["clipboard", "shellExecute", "fileSystem"];

  if (perms.some(p => dangerous.includes(p))) return "dangerous";
  if (perms.some(p => caution.includes(p))) return "caution";
  return "safe";
}

export const PERMISSION_META: Record<Permission, { icon: string; labelRu: string; labelEn: string; description: string }> = {
  requiresAdmin: {
    icon: "Shield",
    labelRu: "Права администратора",
    labelEn: "Admin rights",
    description: "Скрипту требуется запуск от имени администратора. Полный доступ к системе.",
  },
  network: {
    icon: "Globe",
    labelRu: "Доступ в интернет",
    labelEn: "Network access",
    description: "Скрипт делает HTTP-запросы или скачивает файлы.",
  },
  registry: {
    icon: "Database",
    labelRu: "Реестр Windows",
    labelEn: "Windows registry",
    description: "Чтение или запись в реестр Windows.",
  },
  shellExecute: {
    icon: "Terminal",
    labelRu: "Запуск программ",
    labelEn: "Run programs",
    description: "Скрипт запускает внешние программы (Run/RunWait).",
  },
  clipboard: {
    icon: "Clipboard",
    labelRu: "Буфер обмена",
    labelEn: "Clipboard",
    description: "Чтение или запись в буфер обмена.",
  },
  fileSystem: {
    icon: "FileText",
    labelRu: "Файловая система",
    labelEn: "File system",
    description: "Чтение или запись файлов на диске.",
  },
  keyboardHook: {
    icon: "Keyboard",
    labelRu: "Перехват клавиатуры",
    labelEn: "Keyboard hooks",
    description: "Глобальные горячие клавиши и перехват ввода. Стандартно для AHK.",
  },
  mouseHook: {
    icon: "Mouse",
    labelRu: "Перехват мыши",
    labelEn: "Mouse hooks",
    description: "Перехват кликов и движений мыши.",
  },
};
```

## Frontend компоненты

### `PermissionBadge.tsx` — маленький бейдж

```tsx
const RISK_STYLES: Record<RiskLevel, string> = {
  safe: "bg-green-500/15 text-green-300 border-green-500/30",
  caution: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  dangerous: "bg-red-500/15 text-red-300 border-red-500/30",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "Безопасно",
  caution: "Внимание",
  dangerous: "Опасно",
};

export function PermissionBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`
      inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border
      ${RISK_STYLES[risk]}
    `}>
      {risk === "dangerous" && <AlertTriangle size={10} />}
      {RISK_LABEL[risk]}
    </span>
  );
}
```

Добавить в `CatalogCard.tsx` рядом с тегами/метаданными.

### `PermissionsList.tsx` — полный список для деталки

```tsx
export function PermissionsList({ permissions }: { permissions: Permission[] }) {
  const allPerms: Permission[] = Object.keys(PERMISSION_META) as Permission[];
  const risk = calculateRisk(permissions);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-white/90">Разрешения</h3>
        <PermissionBadge risk={risk} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {allPerms.map(perm => {
          const has = permissions.includes(perm);
          const meta = PERMISSION_META[perm];
          return (
            <div
              key={perm}
              className={`
                flex items-start gap-2 p-2 rounded-lg
                ${has ? 'bg-white/5 text-white/90' : 'bg-white/2 text-white/30'}
              `}
              title={meta.description}
            >
              <Icon name={meta.icon} size={14} className="mt-0.5 flex-shrink-0" />
              <span className="text-xs">{meta.labelRu}</span>
              {has ? (
                <Check size={12} className="ml-auto text-green-400" />
              ) : (
                <X size={12} className="ml-auto text-white/20" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### `TrustPromptDialog.tsx`

```tsx
export function TrustPromptDialog({ script, onConfirm, onCancel }: Props) {
  const risk = calculateRisk(script.permissions);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="
        max-w-md w-full mx-4 rounded-2xl p-6
        bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl
      ">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-500/20">
            <AlertTriangle className="text-red-400" />
          </div>
          <h2 className="text-lg font-semibold">
            Установить "{script.name}"?
          </h2>
        </div>

        <div className="text-sm text-white/70 mb-4">
          Этот скрипт запрашивает повышенные разрешения:
        </div>

        <div className="space-y-1.5 mb-5">
          {script.permissions.map(perm => {
            const meta = PERMISSION_META[perm];
            return (
              <div key={perm} className="flex items-center gap-2 text-sm">
                <span className="text-amber-300">•</span>
                <span className="text-white/80">{meta.labelRu}</span>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-white/50 mb-5">
          Автор: <span className="text-white/70">{script.author}</span>
          {script.trustLevel === "unverified" && " (не верифицирован)"}
        </div>

        <div className="text-xs text-white/40 mb-5 p-3 rounded-lg bg-white/5 border border-white/10">
          AHK-скрипты выполняются с полными правами пользователя.
          Рекомендуется просмотреть исходный код перед установкой.
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigateToDetail(script.id)}
            className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
          >
            Исходный код
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium"
          >
            Установить
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Логика подтверждения в `installScript`

```typescript
installScript: async (script) => {
  const risk = calculateRisk(script.permissions || []);
  const requiresPrompt = risk === "dangerous"
                       && script.trustLevel !== "trusted"
                       && script.trustLevel !== "curated";

  if (requiresPrompt) {
    // Открываем модалку, ждём решения
    set({ pendingInstallScript: script });
    return; // дальше — по клику Confirm в диалоге
  }

  // Установка без подтверждения
  await performInstall(script);
},

confirmPendingInstall: async () => {
  const script = get().pendingInstallScript;
  if (script) {
    set({ pendingInstallScript: null });
    await performInstall(script);
  }
},

cancelPendingInstall: () => set({ pendingInstallScript: null }),
```

В `MarketplaceView.tsx` рендерим диалог:

```tsx
{pendingInstallScript && (
  <TrustPromptDialog
    script={pendingInstallScript}
    onConfirm={confirmPendingInstall}
    onCancel={cancelPendingInstall}
  />
)}
```

## Blocklist

### Rust команда

```rust
const BLOCKLIST_URL: &str = "https://raw.githubusercontent.com/your-org/ahk-manager-store/main/blocklist.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct BlockedScript {
    pub script_id: String,
    pub versions: Vec<String>,
    pub reason: String,
    pub severity: String,
    pub action: String,
}

#[derive(Serialize, Deserialize)]
pub struct Blocklist {
    pub version: u32,
    pub blocked: Vec<BlockedScript>,
}

#[tauri::command]
pub async fn marketplace_check_blocklist(
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<Vec<BlockedScript>, String> {
    let resp = reqwest::get(BLOCKLIST_URL).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Ok(vec![]); }
    let blocklist: Blocklist = resp.json().await.map_err(|e| e.to_string())?;

    let installed = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        crate::db::marketplace_get_all_installed(&conn).map_err(|e| e.to_string())?
    };

    // Найти пересечения
    let mut matched = Vec::new();
    for blocked in &blocklist.blocked {
        if let Some(inst) = installed.iter().find(|s| s.marketplace_id == blocked.script_id) {
            if blocked.versions.is_empty() || blocked.versions.contains(&inst.version) {
                // Если action содержит "kill" — остановить процесс
                if blocked.action.contains("kill") {
                    let _ = kill_script_internal(&inst.install_path);
                }
                matched.push(blocked.clone());
            }
        }
    }

    Ok(matched)
}
```

### Frontend проверка при запуске

В `App.tsx`:

```tsx
useEffect(() => {
  // Через 7 секунд после старта (после catalog и updates)
  const t = setTimeout(async () => {
    const blocked = await checkMarketplaceBlocklist();
    if (blocked.length > 0) {
      useMarketplaceStore.getState().setBlockedScripts(blocked);
      // Покажем sticky notification
      blocked.forEach(b => {
        toast.error(
          `Заблокирован: ${b.script_id} — ${b.reason}`,
          { duration: 30000, action: { label: "Удалить", onClick: () => uninstallScript(b.script_id) } }
        );
      });
    }
  }, 7000);
  return () => clearTimeout(t);
}, []);
```

## Тестирование

1. Подготовить скрипты с разными permissions: один safe (только keyboardHook), один caution (clipboard), один dangerous (network + registry)
2. Открыть Store → видны разные цветовые бейджи на карточках
3. Кликнуть Install на safe → ставится мгновенно
4. Кликнуть Install на dangerous → открывается модалка с перечислением разрешений
5. Нажать Cancel → ничего не устанавливается
6. Нажать Install Anyway → устанавливается
7. Открыть детальную страницу → видна полная PermissionsList с иконками и галочками
8. Создать `blocklist.json` в репо с одним из установленных скриптов
9. Перезапустить app → через 7 секунд toast-предупреждение
10. Запустить заблокированный скрипт → должен мгновенно убиться (если action=kill)
11. Кнопка "Удалить" в toast → уничтожает скрипт

## Что делает этот этап ценным сам по себе

Безопасность была главным риском магазина с самого начала. После этого этапа риск **минимизирован настолько, насколько возможно без серверной инфраструктуры**:
- Пользователь информирован о разрешениях ДО установки
- Опасные скрипты требуют осознанного подтверждения
- Вредоносные скрипты можно мгновенно отключить через blocklist
- Исходный код всегда доступен для проверки

Это последний обязательный этап. После него у тебя есть **полнофункциональный безопасный магазин** который можно публично анонсировать. Все следующие фичи (CI авто-сборка каталога, OAuth публикация из приложения, рейтинги, downloads counter, trust tiers) — это уже opt-in улучшения, делаются по мере необходимости и при наличии ресурсов.

---

## Что осталось ЗА рамками 8 этапов

Эти штуки описаны в основном `STORE_ARCHITECTURE_ru.md`, но **не блокирующие** для рабочего магазина. Делаются когда понадобятся:

1. **GitHub Actions для авто-генерации catalog.json** — пока пишем руками. Когда скриптов 30+ — добавляем `build-catalog.yml`.
2. **CI security scanning** — статический анализ AHK-кода на dangerous patterns в PR. Удобно когда появятся внешние авторы.
3. **Публикация из приложения** — GitHub OAuth Device Flow + форма + автоматический PR. Phase 2.
4. **Рейтинги, отзывы, downloads counter** — нужны когда есть аудитория. Cloudflare Worker для счётчика.
5. **Trust tiers система** — автоматический подъём авторов с unverified → community → trusted на основе истории.
6. **Auto-update в фоне** — сейчас проверка только при запуске. Можно добавить периодическую.
