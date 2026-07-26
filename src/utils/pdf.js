// pdf.js
// Thin wrappers around jsPDF (built-in/raster-template certificates and
// tabular reports) and pdf-lib (the two official vector master
// certificates - Student of the Week/Month) so Certificates.jsx,
// MyCertificates.jsx, and Reports.jsx don't each need to know either
// library's API directly.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

async function fetchBytes(url) {
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
}

function isPdfFile(fileName) {
  return !!fileName && /\.pdf$/i.test(fileName);
}

// issuedDate is a plain "YYYY-MM-DD" (certificates.issued_date) - parsed
// via Date.UTC and formatted with timeZone: 'UTC' so it can't shift a day
// depending on the browser's local timezone (same reasoning as
// addDaysISO/addMonthsISO in utils/date.js).
function formatCertificateDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Overlay coordinates (PDF points, origin bottom-left) measured directly
// from the two official master certificate PDFs (2026-07-26) via their
// pdfjs text layer, then visually confirmed against real name/date
// overlays - see the Recognition certificate audit. Both are A4 landscape
// (841.89 x 595.28pt), the same page size the raster path below already
// uses. Neither template has a dedicated "week of.../month of..." field,
// just one signature-adjacent date line, so `date` renders
// certificates.issued_date, never the award period. maxWidth/minSize let
// a long name auto-shrink instead of overflowing the underline/rule that
// is part of the template artwork.
const VECTOR_TEMPLATE_LAYOUT = {
  student_of_week: {
    name: { y: 296, maxWidth: 460, size: 20, minSize: 13 },
    date: { y: 164, x: 286, size: 11 },
  },
  student_of_month: {
    name: { y: 281, maxWidth: 520, size: 20, minSize: 13 },
    date: { y: 81.9, x: 551, size: 10 },
  },
};

// certificate_templates keys that have a pdf-lib vector layout above - the
// only keys where uploading a .pdf (instead of an image) actually renders
// correctly. Certificates.jsx uses this to restrict which template slots'
// upload button accepts application/pdf.
export const VECTOR_TEMPLATE_KEYS = new Set(Object.keys(VECTOR_TEMPLATE_LAYOUT));

// Draws studentName + issuedDate directly onto the actual template PDF's
// existing page (loaded via pdf-lib, not rasterized) - its vector art,
// fonts, and layout stay exactly the original design; only these two
// fields are added.
async function buildVectorCertificateDoc({ studentName, issuedDate, templateFileUrl, layout }) {
  const bytes = await fetchBytes(templateFileUrl);
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(0);
  const { width } = page.getSize();
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  let nameSize = layout.name.size;
  let nameWidth = boldFont.widthOfTextAtSize(studentName, nameSize);
  while (nameWidth > layout.name.maxWidth && nameSize > layout.name.minSize) {
    nameSize -= 1;
    nameWidth = boldFont.widthOfTextAtSize(studentName, nameSize);
  }
  page.drawText(studentName, {
    x: width / 2 - nameWidth / 2,
    y: layout.name.y,
    size: nameSize,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });

  const dateText = formatCertificateDate(issuedDate);
  const dateWidth = regularFont.widthOfTextAtSize(dateText, layout.date.size);
  page.drawText(dateText, {
    x: layout.date.x - dateWidth / 2,
    y: layout.date.y,
    size: layout.date.size,
    font: regularFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  return pdfDoc;
}

// templateFileUrl is optional - an admin-uploaded background image, one
// per certificate type instead of a single global image (see
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
async function buildRasterCertificateDoc({ studentName, title, issuedDate, templateFileUrl, showTitleOverlay = true }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  if (templateFileUrl) {
    const dataUrl = await loadImageAsDataUrl(templateFileUrl);
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

// Picks the vector (pdf-lib) path only when the resolved template's file
// is one of the two official master PDFs (a .pdf uploaded to the
// student_of_week/student_of_month template slot); every other
// template/type (default, the free-text "Issue certificate" form, or any
// template still an uploaded image) keeps using the original jsPDF raster
// path unchanged.
async function buildCertificate({ studentName, title, issuedDate, templateKey, templateFileUrl, templateFileName, showTitleOverlay }) {
  const layout = templateFileUrl && isPdfFile(templateFileName) ? VECTOR_TEMPLATE_LAYOUT[templateKey] : null;
  if (layout) {
    const doc = await buildVectorCertificateDoc({ studentName, issuedDate, templateFileUrl, layout });
    return { kind: 'pdf-lib', doc };
  }
  const doc = await buildRasterCertificateDoc({ studentName, title, issuedDate, templateFileUrl, showTitleOverlay });
  return { kind: 'jspdf', doc };
}

function certificateFileBaseName(studentName, title) {
  return `${studentName.replace(/\s+/g, '-')}-${title.replace(/\s+/g, '-')}`;
}

export async function downloadCertificatePdf(params) {
  const { kind, doc } = await buildCertificate(params);
  const baseName = certificateFileBaseName(params.studentName, params.title);
  if (kind === 'jspdf') {
    doc.save(`${baseName}.pdf`);
    return;
  }
  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function printCertificatePdf(params) {
  const { kind, doc } = await buildCertificate(params);
  if (kind === 'jspdf') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
    return;
  }
  // pdf-lib has no autoPrint() equivalent - this opens the finished PDF in
  // a new tab (same as the jsPDF path) but doesn't auto-trigger the
  // browser's print dialog; the admin/student prints from there manually.
  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  window.open(URL.createObjectURL(blob), '_blank');
}

// Maps a certificate's title to the certificate_templates row it should
// use. Only the two hardcoded titles finalize_recognition_winner() ever
// sets (migration 0025) get a dedicated key - any other title (the
// free-text "Issue certificate" form, or a future award type with no
// migrated template yet) uses 'default'. Falls back to the 'default' row
// if the specific key has no file uploaded yet, so an admin can adopt
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
