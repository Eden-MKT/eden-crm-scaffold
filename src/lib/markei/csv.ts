// Exportação CSV amigável ao Excel BR: separador ";", BOM UTF-8 e escape de aspas.

type CsvValue = string | number | null | undefined;

const BOM = "﻿";

function escapeCell(value: CsvValue): string {
  const s = String(value ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: CsvValue[][]): void {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(";"));
  const content = BOM + lines.join("\r\n");

  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(content);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
