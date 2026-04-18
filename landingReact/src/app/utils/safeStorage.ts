/** Safe localStorage wrapper — silently catches QuotaExceededError */
export function safeSetItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // QuotaExceededError or SecurityError — ignore silently
    }
}
