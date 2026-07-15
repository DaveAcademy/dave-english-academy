// pdf.js
// Thin wrappers around jsPDF so Certificates.jsx and Reports.jsx don't
// each need to know jsPDF's API directly.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

async function loadImageAsDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not load the certificate template image.'));
    reader.readAsDataURL(blob);
  });
}

// templateImageUrl is optional - an admin-uploaded background (see
// Certificates.jsx / migration 0009's certificate_template table). When
// present it's used full-bleed instead of the built-in design, with the
// same three text fields overlaid in the same positions either way.
async function buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  if (templateImageUrl) {
    const dataUrl = await loadImageAsDataUrl(templateImageUrl);
    const format = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, format, 0, 0, width, height);
  } else {
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
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(15, 55, 63);
  doc.text(studentName, width / 2, 90, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text(title, width / 2, 105, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Issued ${issuedDate}`, width / 2, height - 25, { align: 'center' });

  return doc;
}

export async function downloadCertificatePdf({ studentName, title, issuedDate, templateImageUrl }) {
  const doc = await buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl });
  doc.save(`${studentName.replace(/\s+/g, '-')}-${title.replace(/\s+/g, '-')}.pdf`);
}

export async function printCertificatePdf({ studentName, title, issuedDate, templateImageUrl }) {
  const doc = await buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl });
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
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
