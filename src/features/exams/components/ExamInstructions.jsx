// ExamInstructions.jsx - bilingual "what to do" block shown on the student
// exam portal for each stage the student actually faces: Written exams,
// Oral exams, and reading a graded result. Presentation only - no exam
// logic, no real questions, no answers, no grading. All copy comes from the
// `exams` locale namespace (stage.* keys) so English and Uzbek stay in sync.

// kind = the existing student-facing situation the block explains.
// Written/Oral come straight from exam_type; 'result' explains how to read
// a graded score. Nothing else is invented here.
export default function ExamInstructions({ kind, t }) {
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">{t(`stage.${kind}.title`)}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink/80">{t(`stage.${kind}.instruction`)}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-700">
        <span className="mr-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">{t('stageUzLabel')}</span>
        {t(`stage.${kind}.instructionUz`)}
      </p>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-ink/60">{t('stageHowToLabel')}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-ink/80">{t(`stage.${kind}.howto`)}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-700">
        <span className="mr-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">{t('stageUzLabel')}</span>
        {t(`stage.${kind}.howtoUz`)}
      </p>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-ink/60">{t('stageSampleLabel')}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-ink/80">{t(`stage.${kind}.sample`)}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-700">
        <span className="mr-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">{t('stageUzLabel')}</span>
        {t(`stage.${kind}.sampleUz`)}
      </p>
    </div>
  );
}