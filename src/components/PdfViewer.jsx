// PdfViewer.jsx
// In-app PDF viewer for Lesson Hub V2, rendered with pdf.js (not an iframe)
// so the app can see and remember the current page. Downloads the file
// bytes as a Blob (same storage RLS gate as before - can_read_lesson_pdf),
// parses it with pdf.js, and draws each page to a canvas.
//
// Compared to the old <iframe> viewer this adds: a real loading indicator,
// page navigation + jump-to-page, zoom, a page progress bar, and an
// onPageChange callback so the parent can persist last_page per student
// (student_lesson_progress). The parent passes initialPage to resume where
// the student left off.
//
// pdf.js is imported lazily (dynamic import) so the ~1MB library only loads
// the first time a PDF is actually opened, keeping the main bundle lean.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, FileText, Loader2,
  ZoomIn, ZoomOut, X, RotateCw,
} from 'lucide-react';
import { getAttachmentBlob } from '../lib/db';

// Static import is fine for the worker URL - it's just a string asset path,
// tiny. The library itself comes from the dynamic import in loadDoc().
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    });
  }
  return pdfjsPromise;
}

export default function PdfViewer({ path, fileName, initialPage = 1, onPageChange, onClose }) {
  const [doc, setDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // --- Load the document once, resume at initialPage ---------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const pdfjs = await getPdfjs();
        const blob = await getAttachmentBlob(path);
        const buffer = await blob.arrayBuffer();
        const loaded = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setDoc(loaded);
        setNumPages(loaded.numPages);

        // Fit the first page to the container width (respects mobile), then
        // resume at the remembered page.
        const p1 = await loaded.getPage(1);
        const v1 = p1.getViewport({ scale: 1 });
        const width = containerRef.current?.clientWidth || 700;
        setScale(Math.max(0.5, (width - 16) / v1.width));
        const start = Math.min(Math.max(1, Number(initialPage) || 1), loaded.numPages);
        setPageNum(start);
      } catch {
        if (!cancelled) setLoadError('Could not load this PDF. It may be missing or you may not have access to it yet.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path]); // initialPage is only read at open time, not a dependency

  // --- Render the current page ------------------------------------------
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        if (e?.name === 'RenderingCancelledException' || cancelled) return;
        // Non-critical - a failed page render shouldn't kill the viewer.
      }
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [doc, pageNum, scale]);

  // --- Tell the parent which page we're on ------------------------------
  const reportPage = useCallback(() => {
    if (doc && onPageChange) onPageChange(pageNum);
  }, [doc, onPageChange, pageNum]);
  useEffect(() => { reportPage(); }, [reportPage]);

  const goTo = (n) => {
    if (!doc) return;
    setPageNum(Math.min(Math.max(1, n), doc.numPages));
  };

  const close = () => { onClose?.(); };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-2 sm:p-4" onClick={close}>
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-3 py-2 sm:px-4">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <FileText size={16} className="flex-shrink-0 text-brand-500" />
            <span className="truncate">{fileName || 'PDF'}</span>
          </span>

          <div className="flex items-center gap-1">
            {doc && (
              <>
                <button type="button" onClick={() => goTo(pageNum - 1)} disabled={pageNum <= 1}
                  className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className="flex items-center gap-1 text-xs font-medium text-ink/60">
                  <input
                    type="number"
                    min={1}
                    max={doc.numPages}
                    value={pageNum}
                    onChange={(e) => goTo(Number(e.target.value))}
                    className="w-12 rounded border border-ink/15 px-1 py-0.5 text-center text-xs font-semibold text-ink"
                    aria-label="Page number"
                  />
                  <span>/ {doc.numPages}</span>
                </span>
                <button type="button" onClick={() => goTo(pageNum + 1)} disabled={pageNum >= doc.numPages}
                  className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-40" aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
                <span className="mx-1 h-5 w-px bg-ink/10" />
                <button type="button" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
                  className="rounded-lg p-1.5 text-ink/60 hover:bg-ink/5" aria-label="Zoom out">
                  <ZoomOut size={15} />
                </button>
                <span className="w-10 text-center text-xs font-semibold text-ink/60">{Math.round(scale * 100)}%</span>
                <button type="button" onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
                  className="rounded-lg p-1.5 text-ink/60 hover:bg-ink/5" aria-label="Zoom in">
                  <ZoomIn size={15} />
                </button>
              </>
            )}
            <button type="button" onClick={close}
              className="ml-1 flex-shrink-0 rounded-lg p-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close PDF">
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Page progress (thin bar under the toolbar) */}
        {doc && (
          <div className="h-0.5 w-full bg-ink/5">
            <div
              className="h-full bg-brand-500 transition-[width] duration-200"
              style={{ width: `${Math.round((pageNum / doc.numPages) * 100)}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div ref={containerRef} className="relative flex-1 overflow-auto bg-ink/10">
          {loadError ? (
            <div className="flex h-full items-center justify-center gap-2 p-6 text-center text-sm font-semibold text-inactive">
              <AlertTriangle size={16} /> {loadError}
            </div>
          ) : !doc ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink/50">
              <Loader2 size={28} className="animate-spin text-brand-500" />
              <span>Loading PDF…</span>
            </div>
          ) : (
            <div className="flex min-h-full min-w-fit items-start justify-center p-2 sm:p-4">
              <canvas ref={canvasRef} className="rounded shadow-lg" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
