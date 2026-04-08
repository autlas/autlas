import { useEffect, useState } from "react";

/**
 * Subscribes to the persisted "vim mode" toggle from Settings.
 *
 * The flag lives in localStorage under `ahk_vim_enabled` and is broadcast
 * via the custom event `ahk-vim-enabled-changed` so every component that
 * reads it can react instantly without going through the store.
 *
 * Used by:
 *  - useVimHotkeys (to gate the entire `hk` flag)
 *  - useNavigation (Shift+Alt+J/K tab switching)
 *  - ScriptTreeToolbar (the `s` sort dropdown hotkey)
 *  - Tooltip / ContextMenuItem (to hide shortcut hints when vim is off)
 */
export function useVimEnabled(): boolean {
    const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem("ahk_vim_enabled") !== "false");
    useEffect(() => {
        const onChange = () => setEnabled(localStorage.getItem("ahk_vim_enabled") !== "false");
        window.addEventListener("ahk-vim-enabled-changed", onChange);
        return () => window.removeEventListener("ahk-vim-enabled-changed", onChange);
    }, []);
    return enabled;
}
