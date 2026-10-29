/** NAV and daily rollover use the same Beijing calendar, independent of device zone. */
export function beijingDate(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("无效时间。");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
