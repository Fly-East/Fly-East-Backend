export const formatDate = (value?: Date | string): string => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatCurrency = (value?: number | string): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

export const renderKeyValueRows = (
  rows: Array<{ label: string; value: string | number | undefined | null }>,
): string =>
  rows
    .filter((row) => hasValue(row.value))
    .map(
      ({ label, value }) => `
        <tr>
          <th>${label}</th>
          <td>${value}</td>
        </tr>`,
    )
    .join("");
