// MyCertificates.jsx

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Award, Download, Printer, MessageSquare } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { downloadCertificatePdf, printCertificatePdf, pickCertificateTemplate } from '../../utils/pdf';
import { getAttachmentUrl } from '../../lib/db';

export default function MyCertificates() {
  const { t } = useTranslation('portal');
  const { students, certificates, certificateTemplates } = useAcademy();
  const me = students[0];
  const [certError, setCertError] = useState('');

  // See Certificates.jsx's resolveTemplate() - same per-type resolution
  // (migration 0026), duplicated here rather than shared since each page
  // already had its own near-identical copy before that redesign too.
  // templateKey/templateFileName let pdf.js tell a .pdf master template
  // (Student of the Week/Month - rendered via pdf-lib, vector-preserving)
  // apart from an admin-uploaded image template (rendered via jsPDF).
  const resolveTemplate = async (title) => {
    const row = pickCertificateTemplate(certificateTemplates, title);
    return {
      templateKey: row?.key || null,
      templateFileUrl: row?.file_url ? await getAttachmentUrl(row.file_url) : null,
      templateFileName: row?.file_name || null,
      showTitleOverlay: row?.show_title_overlay ?? true,
    };
  };

  // pickCertificateTemplate() throws for a Student of the Week/Month
  // title whose mandatory template hasn't been uploaded - there's no
  // fallback design for those two, so this surfaces a plain "not ready
  // yet" message rather than failing silently. A student can't fix a
  // missing template themselves, so the raw admin-facing error message
  // from pdf.js isn't shown here.
  const handleDownload = async (c) => {
    setCertError('');
    try {
      const template = await resolveTemplate(c.title);
      await downloadCertificatePdf({
        studentName: me?.real_name || 'Student',
        title: c.title,
        issuedDate: c.issued_date,
        ...template,
      });
    } catch {
      setCertError(t('certificateUnavailable'));
    }
  };

  const handlePrint = async (c) => {
    setCertError('');
    try {
      const template = await resolveTemplate(c.title);
      await printCertificatePdf({
        studentName: me?.real_name || 'Student',
        title: c.title,
        issuedDate: c.issued_date,
        ...template,
      });
    } catch {
      setCertError(t('certificateUnavailable'));
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('myCertificatesTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('certificatesSubtitle')}</p>
      </header>

      {certError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{certError}</div>}

      {certificates.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noCertificatesYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {certificates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Award size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-ink/50">{t('issuedOn', { date: c.issued_date })}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  onClick={() => handleDownload(c)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                >
                  <Download size={14} /> PDF
                </button>
                <button
                  onClick={() => handlePrint(c)}
                  className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                >
                  <Printer size={14} /> {t('print')}
                </button>
                <Link
                  to={`/chat?type=certificate&id=${c.id}`}
                  className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5"
                  aria-label={t('discussCertificateAria')}
                >
                  <MessageSquare size={15} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
