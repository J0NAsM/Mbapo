export function formatMessageTime(value?: string | null): string {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? value || ""
    : new Intl.DateTimeFormat("es-PY", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
