// pdf.js
// Thin wrappers around jsPDF so Certificates.jsx and Reports.jsx don't
// each need to know jsPDF's API directly.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_NAVY = [15, 55, 63]; // matches tailwind brand-700, used by the generic fallback design
const GOLD = [180, 142, 70];
const NAVY = [15, 30, 55];

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

// Picks one of the two built-in designs below by matching the certificate's
// title text, so issuing a certificate titled e.g. "Student of the Month"
// automatically gets that look with no extra admin step. Anything else
// falls back to the original generic design (drawGenericDesign).
function matchBuiltinDesign(title) {
  const normalized = (title || '').trim().toLowerCase();
  if (normalized.includes('student of the month')) return 'month';
  if (normalized.includes('student of the week')) return 'week';
  return null;
}

// Vector recreation of the academy's "Student of the Month" certificate
// (gold/navy, corner accent, circular seal). studentName/title/issuedDate
// are rendered at design-appropriate positions rather than as a generic
// overlay, since the title here is part of the headline itself.
function drawMonthDesign(doc, { width, height, studentName, title, issuedDate }) {
  const cx = width / 2;

  doc.setFillColor(253, 251, 246);
  doc.rect(0, 0, width, height, 'F');

  doc.setFillColor(...NAVY);
  doc.triangle(width, height, width - 75, height, width, height - 95, 'F');

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.rect(8, 8, width - 16, height - 16);

  doc.setFont('times', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...GOLD);
  doc.text('C E R T I F I C A T E', cx, 32, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text('O F   A C H I E V E M E N T', cx, 41, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(120, 110, 90);
  doc.text('for distinguished excellence', cx, 48, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(22);
  doc.setTextColor(...GOLD);
  doc.text((title || 'Student of the Month').toUpperCase(), cx, 62, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('THIS CERTIFICATE IS PROUDLY PRESENTED TO', cx, 74, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text(studentName, cx, 81, { align: 'center' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx - 55, 84, cx + 55, 84);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('In recognition of exemplary academic performance, consistent effort,', cx, 95, { align: 'center' });
  doc.text('and positive classroom contributions throughout the month.', cx, 100, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('May your future shine even brighter with this achievement!', cx, 112, { align: 'center' });

  doc.setFillColor(...GOLD);
  doc.circle(width - 38, height - 30, 15, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...NAVY);
  doc.text('MONTHLY', width - 38, height - 32, { align: 'center' });
  doc.text('ACCOLADE', width - 38, height - 28, { align: 'center' });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.line(25, height - 28, 90, height - 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text("TEACHER'S SIGNATURE", 57.5, height - 23, { align: 'center' });

  doc.line(110, height - 28, 165, height - 28);
  doc.text(`DATE: ${issuedDate}`, 137.5, height - 23, { align: 'center' });
}

// Vector recreation of the academy's "Student of the Week" certificate
// (minimal, navy/gold text on white, two-column footer signature).
function drawWeekDesign(doc, { width, height, studentName, title, issuedDate }) {
  const cx = width / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...GOLD);
  doc.text('CERTIFICATE OF ACHIEVEMENT', cx, 32, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('FOR DISTINGUISHED EXCELLENCE', cx, 40, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...NAVY);
  doc.text((title || 'Student of the Week').toUpperCase(), cx, 58, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('This certificate is proudly presented to:', cx, 70, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text(studentName, cx, 87, { align: 'center' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(cx - 70, 90, cx + 70, 90);

  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('In recognition of exemplary academic performance, consistent effort,', cx, 100, { align: 'center' });
  doc.text('and positive classroom contributions throughout the week.', cx, 107, { align: 'center' });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.line(cx - 90, height - 30, cx - 30, height - 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(issuedDate, cx - 60, height - 25, { align: 'center' });
  doc.setFontSize(8);
  doc.text('DATE', cx - 60, height - 21, { align: 'center' });

  doc.line(cx + 30, height - 30, cx + 90, height - 30);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('Dave', cx + 60, height - 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('ENGLISH INSTRUCTOR', cx + 60, height - 21, { align: 'center' });
}

// The original built-in design, unchanged - used whenever there's no
// admin-uploaded template and the title doesn't match a built-in design.
function drawGenericDesign(doc, { width, height }) {
  doc.setDrawColor(...BRAND_NAVY);
  doc.setLineWidth(2);
  doc.rect(10, 10, width - 20, height - 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_NAVY);
  doc.text('DAVE ACADEMY', width / 2, 35, { align: 'center' });

  doc.setFontSize(28);
  doc.text('Certificate of Achievement', width / 2, 55, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('This certifies that', width / 2, 75, { align: 'center' });
}

// The original shared text overlay, unchanged - used for both the
// admin-uploaded template and the generic fallback design.
function drawGenericOverlay(doc, { width, height, studentName, title, issuedDate }) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...BRAND_NAVY);
  doc.text(studentName, width / 2, 90, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text(title, width / 2, 105, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Issued ${issuedDate}`, width / 2, height - 25, { align: 'center' });
}

// templateImageUrl is optional - an admin-uploaded background (see
// Certificates.jsx / migration 0009's certificate_template table). When
// present it always takes priority, used full-bleed with the same generic
// text overlay as before. Otherwise, the certificate's title is matched
// against the two built-in designs recreated for this academy (see
// matchBuiltinDesign); anything else falls back to the original generic
// design, both unchanged from before this design set was added.
async function buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  if (templateImageUrl) {
    const dataUrl = await loadImageAsDataUrl(templateImageUrl);
    const format = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, format, 0, 0, width, height);
    drawGenericOverlay(doc, { width, height, studentName, title, issuedDate });
    return doc;
  }

  const builtin = matchBuiltinDesign(title);
  if (builtin === 'month') {
    drawMonthDesign(doc, { width, height, studentName, title, issuedDate });
    return doc;
  }
  if (builtin === 'week') {
    drawWeekDesign(doc, { width, height, studentName, title, issuedDate });
    return doc;
  }

  drawGenericDesign(doc, { width, height });
  drawGenericOverlay(doc, { width, height, studentName, title, issuedDate });
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
