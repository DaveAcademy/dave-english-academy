// pdf.js
// Thin wrappers around jsPDF so Certificates.jsx and Reports.jsx don't
// each need to know jsPDF's API directly.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function downloadCertificatePdf({ studentName, title, issuedDate }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  doc.setDrawColor(15, 55, 63);
  doc.setLineWidth(2);
  doc.rect(10, 10, width - 20, height - 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 55, 63);
  doc.text('DAVE ACADEMY', width / 2, 35, { align: 'center' });

  doc.setFontSize(28);
  doc.text('Certificate of Achievement', width / 2, 55, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('This certifies that', width / 2, 75, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(studentName, width / 2, 90, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text(title, width / 2, 105, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Issued ${issuedDate}`, width / 2, height - 25, { align: 'center' });

  doc.save(`${studentName.replace(/\s+/g, '-')}-${title.replace(/\s+/g, '-')}.pdf`);
}

export function downloadReportPdf({ title, columns, rows, subtitle }) {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(subtitle, 14, 25);
  }
  autoTable(doc, {
    startY: subtitle ? 30 : 24,
    head: [columns],
    body: rows,
    headStyles: { fillColor: [15, 55, 63] },
    styles: { fontSize: 9 },
  });
  doc.save(`${title.replace(/\s+/g, '-')}.pdf`);
}
