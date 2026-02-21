export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "—";

  const sign = numeric < 0 ? "-" : "";
  const absolute = Math.abs(numeric).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${sign}$${absolute}`;
}
