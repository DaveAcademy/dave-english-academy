// MyCertificates.jsx

import { Link } from 'react-router-dom';
import { Award, Download, Printer, MessageSquare } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { downloadCertificatePdf, printCertificatePdf } from '../../utils/pdf';
import { getAttachmentUrl } from '../../lib/db';

export default function MyCertificates() {
  const { students, certificates, certificateTemplate } = useAcademy();
  const me = students[0];

  const resolveTemplateUrl = async () => {
    if (!certificateTemplate?.file_url) return null;
    return getAttachmentUrl(certificateTemplate.file_url);
  };

  const handleDownload = async (c) => {
    const templateImageUrl = await resolveTemplateUrl();
    await downloadCertificatePdf({ studentName: me?.real_name || 'Student', title: c.title, issuedDate: c.issued_date, templateImageUrl });
  };

  const handlePrint = async (c) => {
    const templateImageUrl = await resolveTemplateUrl();
    await printCertificatePdf({ studentName: me?.real_name || 'Student', title: c.title, issuedDate: c.issued_date, templateImageUrl });
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">My Certificates</h1>
        <p className="mt-1 text-sm text-ink/50">Certificates you've earned.</p>
      </header>

      {certificates.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No certificates yet</p>
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
                <p className="text-xs text-ink/50">Issued {c.issued_date}</p>
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
                  <Printer size={14} /> Print
                </button>
                <Link
                  to={`/chat?type=certificate&id=${c.id}`}
                  className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5"
                  aria-label="Discuss this certificate"
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
