// MyCertificates.jsx

import { Award, Download } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { downloadCertificatePdf } from '../../utils/pdf';

export default function MyCertificates() {
  const { students, certificates } = useAcademy();
  const me = students[0];

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
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Award size={18} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-ink/50">Issued {c.issued_date}</p>
              </div>
              <button
                onClick={() =>
                  downloadCertificatePdf({ studentName: me?.real_name || 'Student', title: c.title, issuedDate: c.issued_date })
                }
                className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
              >
                <Download size={14} /> PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
