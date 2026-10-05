// csv.js
// Minimal CSV export helper - Reports.jsx / pdf.js only had a PDF exporter
// (downloadReportPdf) before this. Same {columns, rows} shape so any table
// that already builds rows for downloadReportPdf can reuse this as-is.
// No dependency added - Papaparse etc. would be overkill for "join cells,
// quote if needed, trigger a download".

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  // \r\n + BOM so Excel (incl. on Windows) opens UTF-8 (Cyrillic/Uzbek
  // names) correctly instead of mangling it as ANSI.
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv({ title, columns, rows }) {
  const csv = toCsv(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
