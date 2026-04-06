export function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24 && d.getDate() === now.getDate()) return `today ${time}`;
    if (diffDays === 1) return `yesterday ${time}`;
    if (diffDays < 7) return `${diffDays}d ago, ${time}`;
    return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) + ` ${time}`;
  } catch { return iso; }
}
