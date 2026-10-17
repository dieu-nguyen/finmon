/** Named-scan times are stored as UTC without an offset. */
export function formatScannedAt(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const date = new Date(hasZone ? trimmed : `${trimmed}Z`);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!day || !month || !year || !hour || !minute) return "";
  return `${day} ${month} ${year}, ${hour}:${minute}`;
}
