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

// templateImageUrl is optional - an admin-uploaded background, now one per
// certificate type instead of a single global image (see
// certificate_templates, migration 0026 - pickCertificateTemplate() below
// resolves which row applies). When present it's used full-bleed instead
// of the built-in design.
//
// showTitleOverlay defaults to true (matches every template's behavior
// before 0026) - an admin turns it off per-template when that template's
// own artwork already states the award, so the title doesn't render
// twice (or, worse, contradict a different award's template - the actual
// bug the 2026-07-22 certificate QA pass found: a template already
// reading "Student Of The Week" with "Student of the Month" overlaid on
// top of it). studentName and issuedDate always render regardless -
// neither can ever be baked into a static template image.
async function buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl, showTitleOverlay = true }) {
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

  doc.setTextColor(15, 55, 63);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(studentName, width / 2, 90, { align: 'center' });

  if (showTitleOverlay) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.text(title, width / 2, 105, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Issued ${issuedDate}`, width / 2, height - 25, { align: 'center' });

  return doc;
}

export async function downloadCertificatePdf({ studentName, title, issuedDate, templateImageUrl, showTitleOverlay }) {
  const doc = await buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl, showTitleOverlay });
  doc.save(`${studentName.replace(/\s+/g, '-')}-${title.replace(/\s+/g, '-')}.pdf`);
}

export async function printCertificatePdf({ studentName, title, issuedDate, templateImageUrl, showTitleOverlay }) {
  const doc = await buildCertificateDoc({ studentName, title, issuedDate, templateImageUrl, showTitleOverlay });
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

// Maps a certificate's title to the certificate_templates row it should
// use. Only the two hardcoded titles finalize_recognition_winner() ever
// sets (migration 0025) get a dedicated key - any other title (the
// free-text "Issue certificate" form, or a future award type with no
// migrated template yet) uses 'default'. Falls back to the 'default' row
// if the specific key has no image uploaded yet, so an admin can adopt
// per-type templates gradually - nothing breaks in the meantime.
const TITLE_TEMPLATE_KEYS = {
  'Student of the Week': 'student_of_week',
  'Student of the Month': 'student_of_month',
};

export function pickCertificateTemplate(templates, title) {
  const key = TITLE_TEMPLATE_KEYS[title] || 'default';
  const specific = templates.find((t) => t.key === key);
  if (specific?.file_url) return specific;
  return templates.find((t) => t.key === 'default') || null;
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
