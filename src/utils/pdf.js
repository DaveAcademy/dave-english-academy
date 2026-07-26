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
  // Confirmed correct against the original PDF and in production - do not
  // change this template's coordinates/sizes/font/color.
  student_of_week: {
    name: { y: 296, maxWidth: 460, size: 20, minSize: 13 },
    date: { y: 164, x: 286, size: 11 },
  },
  student_of_month: {
    name: { y: 281, maxWidth: 520, size: 20, minSize: 13 },
    // The "TEACHER'S SIGNATURE"/"DATE:" label row (y 81.9) has its own
    // blank gold rule above it at y=90 for BOTH fields (confirmed by
    // rendering test gridlines directly over the original PDF) - same
    // "value above the rule, label below it" pattern as the Week
    // template's "Dave"/date, not a value inline with the label. y=95
    // (~5pt clearance above the rule) is used for both fields below.
    // Previously the date was drawn at y=81.9 - the same line as the
    // "DATE:" label itself - which is the misplacement that was reported.
    date: { y: 95, x: 551.45, size: 10 },
    // This template's signature line was left entirely blank in the
    // original artwork (unlike Week's, which already has "Dave" baked in
    // as static text) - certificates.issued_by exists in the database but
    // is never joined to a profile name anywhere in the app, so there is
    // no per-certificate teacher name wired up to draw here. Rendering
    // the same static "Dave" as Week's baked-in signature keeps both
    // official templates consistent for this single-instructor academy
    // without inventing new data plumbing.
    signature: { y: 95, x: 307.6, size: 12, text: 'Dave' },
  },
};

// certificate_templates keys that have a pdf-lib vector layout above - the
// only keys where uploading a .pdf (instead of an image) actually renders
// correctly. Certificates.jsx uses this to restrict which template slots'
// upload button accepts application/pdf.
export const VECTOR_TEMPLATE_KEYS = new Set(Object.keys(VECTOR_TEMPLATE_LAYOUT));

// Draws studentName + issuedDate (+ a static signature name, for
// student_of_month only - see VECTOR_TEMPLATE_LAYOUT) directly onto the
// actual template PDF's existing page (loaded via pdf-lib, not
// rasterized) - its vector art, fonts, and layout stay exactly the
// original design; only these fields are added.
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

  if (layout.signature) {
    const sigWidth = boldFont.widthOfTextAtSize(layout.signature.text, layout.signature.size);
    page.drawText(layout.signature.text, {
      x: layout.signature.x - sigWidth / 2,
      y: layout.signature.y,
      size: layout.signature.size,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16),
    });
  }

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
// sets (migration 0025) get a dedicated key. Matched case/whitespace-
// insensitively: finalize_recognition_winner() always sets the exact-case
// string, but Certificates.jsx's "Issue certificate" title is free text,
// and a human retyping "Student of the Week" is liable to vary case or
// add a stray space.
const TITLE_TEMPLATE_KEYS = {
  'student of the week': 'student_of_week',
  'student of the month': 'student_of_month',
};

const RECOGNITION_TEMPLATE_LABELS = {
  student_of_week: 'Student of the Week',
  student_of_month: 'Student of the Month',
};

function normalizeTitleForTemplateLookup(title) {
  return (title || '').trim().toLowerCase();
}

// There is deliberately no "default" template to fall back to (removed
// 2026-07-26, migration 0036) - a Student of the Week/Month certificate
// is an official award, and silently substituting some other design (or,
// worse, an unrelated one an admin happened to have uploaded elsewhere)
// would look like a normal successful certificate while actually being
// wrong. If the certificate's title matches one of the two recognition
// award types but that type's template file hasn't been uploaded yet,
// this throws instead of returning anything - the caller must surface
// that as an error, not generate a certificate. Any other title (the
// free-text "Issue certificate" form, for a non-recognition certificate)
// has no mandatory template and returns null, which renders the plain
// built-in design (buildRasterCertificateDoc) - that's an honest generic
// look, not a specific design pretending to be the right one.
export function pickCertificateTemplate(templates, title) {
  const key = TITLE_TEMPLATE_KEYS[normalizeTitleForTemplateLookup(title)];
  if (!key) return null;
  const specific = templates.find((t) => t.key === key);
  if (!specific?.file_url) {
    throw new Error(
      `The "${RECOGNITION_TEMPLATE_LABELS[key]}" certificate template hasn't been uploaded yet. Upload it in Certificate templates before generating this certificate.`
    );
  }
  return specific;
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
