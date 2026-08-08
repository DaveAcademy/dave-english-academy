// Reports.jsx
// Admin-only (see Nav.jsx `adminOnly` flag) - this is the one place that
// can show academy-wide financial figures (the Payments report), which is
// exactly why it's not part of the student portal's nav.

import { useState, useMemo, useEffect } from 'react';
import { Download, FileBarChart, ShieldAlert } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LEVELS } from '../lib/levels';
import { formatUZS } from '../utils/format';
import { downloadReportPdf } from '../utils/pdf';
import { getPaymentCollectionSummary, getStudentPaymentStatus, listAllStudentLessonProgress } from '../lib/storageBridge';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor, nextUnfinishedLesson,
} from '../lib/lessonLogic';

const REPORT_TYPES = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'payments', label: 'Payment Collection' },
  { key: 'exams', label: 'Exams' },
  { key: 'homework', label: 'Homework' },
  { key: 'lessonProgress', label: 'Lesson Progress' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'points', label: 'Points' },
  { key: 'monthly', label: 'Student Coverage' },
];

const STATUS_LABELS = { paid: 'Paid', due_soon: 'Due soon', overdue: 'Overdue' };

export default function Reports() {
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const {
    students,
    attendance,
    exams,
    examScores,
    homework,
    homeworkStatus,
    certificates,
    lessons,
    curriculumProgress,
    lessonProgress,
  } = useAcademy();

  const [reportType, setReportType] = useState('attendance');
  const [level, setLevel] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // Payment Collection Report: row-level cash-flow detail for an admin date
  // range (migration 0065) - fetched fresh whenever that report/range is
  // active. Empty from/to means "no filter", same as every other report
  // here, so it's widened to an effectively-unbounded range for the RPC.
  const [paymentRows, setPaymentRows] = useState([]);
  useEffect(() => {
    if (reportType !== 'payments') return;
    let cancelled = false;
    getPaymentCollectionSummary(fromDate || '2000-01-01', toDate || '2100-01-01')
      .then((rows) => !cancelled && setPaymentRows(rows))
      .catch(() => !cancelled && setPaymentRows([]));
    return () => {
      cancelled = true;
    };
  }, [reportType, fromDate, toDate]);

  // Student Coverage Report: current billing status per student (coverage
  // logic, get_student_payment_status) - not scoped to the year/month
  // picker, which only drives the attendance/homework columns here.
  const [coverageStatuses, setCoverageStatuses] = useState({});
  useEffect(() => {
    if (reportType !== 'monthly') return;
    let cancelled = false;
    Promise.all(
      students.map((s) =>
        getStudentPaymentStatus(s.id)
          .then((st) => [s.id, st])
          .catch(() => [s.id, null])
      )
    ).then((pairs) => !cancelled && setCoverageStatuses(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [reportType, students]);

  // Lesson Progress Report: academy-wide student_lesson_progress rows
  // (migration 0094) - only reachable by admins/teachers, whose RLS grant
  // full select on that table. Per-student rows are derived with the same
  // lessonLogic status/cap/next rules as MyProgress and the Lesson Hub, so
  // this report always agrees with what the portal shows each student.
  const [allLessonProgress, setAllLessonProgress] = useState([]);
  useEffect(() => {
    if (reportType !== 'lessonProgress') return;
    let cancelled = false;
    listAllStudentLessonProgress()
      .then((rows) => !cancelled && setAllLessonProgress(rows || []))
      .catch(() => !cancelled && setAllLessonProgress([]));
    return () => {
      cancelled = true;
    };
  }, [reportType]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const filteredStudentIds = useMemo(() => {
    const filtered = level ? students.filter((s) => s.level === level) : students;
    return new Set(filtered.map((s) => s.id));
  }, [students, level]);

  const inDateRange = (dateStr) => {
    if (fromDate && dateStr < fromDate) return false;
    if (toDate && dateStr > toDate) return false;
    return true;
  };

  const { columns, rows } = useMemo(() => {
    switch (reportType) {
      case 'attendance': {
        const cols = ['Student', 'Date', 'Status'];
        const data = attendance
          .filter((a) => filteredStudentIds.has(a.student_id) && inDateRange(a.date))
          .map((a) => [studentsById[a.student_id]?.real_name || '—', a.date, a.status]);
        return { columns: cols, rows: data };
      }
      case 'payments': {
        const cols = ['Student', 'Date', 'Amount', 'Type', 'Method'];
        const data = paymentRows
          .filter((p) => filteredStudentIds.has(p.student_id))
          .map((p) => [
            p.student_name || studentsById[p.student_id]?.real_name || '—',
            (p.paid_at || '').slice(0, 10),
            formatUZS(p.amount),
            p.transaction_type,
            p.payment_method || '—',
          ]);
        return { columns: cols, rows: data };
      }
      case 'exams': {
        const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
        const cols = ['Exam', 'Student', 'Score', 'Max score', 'Date'];
        const data = examScores
          .filter((s) => filteredStudentIds.has(s.student_id))
          .map((s) => {
            const exam = examsById[s.exam_id];
            return [exam?.title || '—', studentsById[s.student_id]?.real_name || '—', s.score, exam?.max_score ?? '—', exam?.exam_date || '—'];
          })
          .filter((row) => inDateRange(row[4]));
        return { columns: cols, rows: data };
      }
      case 'homework': {
        const hwById = Object.fromEntries(homework.map((h) => [h.id, h]));
        const cols = ['Homework', 'Student', 'Status', 'Score', 'Due date'];
        const data = homeworkStatus
          .filter((s) => filteredStudentIds.has(s.student_id))
          .map((s) => {
            const hw = hwById[s.homework_id];
            return [hw?.title || '—', studentsById[s.student_id]?.real_name || '—', s.status, s.score ?? '—', hw?.due_date || '—'];
          });
        return { columns: cols, rows: data };
      }
      case 'lessonProgress': {
        const cols = ['Student', 'Level', 'Completed', 'In progress', 'Next lesson', 'Cap', 'Progress %'];
        const activeFiltered = students.filter((s) => s.status === 'Active' && filteredStudentIds.has(s.id));
        const data = activeFiltered.map((s) => {
          const visible = lessons.filter((l) => (!l.group_name && !l.level) || l.group_name === s.group_name || l.level === s.level);
          const pace = teacherPaceFor(curriculumProgress, s.level);
          const cap = lessonCapFor(curriculumProgress, s.level);
          const progressByNum = progressByLessonNumber(allLessonProgress, visible);
          let completed = 0;
          let inProgress = 0;
          for (const l of visible) {
            const st = lessonStatusFor(l, pace, progressByNum, cap);
            if (st === LESSON_STATUS.COMPLETED) completed += 1;
            else if (st === LESSON_STATUS.IN_PROGRESS) inProgress += 1;
          }
          const total = visible.length;
          const next = nextUnfinishedLesson(visible, pace, progressByNum, undefined, cap);
          const nextLabel = next
            ? `${next.topic || next.curriculum_lessons?.title || 'Untitled'} (#${next.curriculum_lessons?.lesson_number})`
            : '—';
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return [s.real_name, s.level, completed, inProgress, nextLabel, cap, `${pct}%`];
        });
        return { columns: cols, rows: data };
      }
      case 'certificates': {
        const cols = ['Student', 'Certificate', 'Issued date'];
        const data = certificates
          .filter((c) => filteredStudentIds.has(c.student_id) && inDateRange(c.issued_date))
          .map((c) => [studentsById[c.student_id]?.real_name || '—', c.title, c.issued_date]);
        return { columns: cols, rows: data };
      }
      case 'points': {
        const cols = ['Rank', 'Student', 'Points'];
        const activeFiltered = students.filter((s) => s.status === 'Active' && filteredStudentIds.has(s.id));
        const ranked = [...activeFiltered].sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || a.real_name.localeCompare(b.real_name));
        const data = ranked.map((s, i) => [i + 1, s.real_name, Number(s.points || 0)]);
        return { columns: cols, rows: data };
      }
      case 'monthly': {
        const cols = ['Student', 'Present', 'Late', 'Absent', 'Payment status', 'Points'];
        const activeFiltered = students.filter((s) => s.status === 'Active' && filteredStudentIds.has(s.id));
        const data = activeFiltered.map((s) => {
          const monthRecords = attendance.filter((a) => {
            const [y, m] = a.date.split('-').map(Number);
            return a.student_id === s.id && y === Number(year) && m === Number(month);
          });
          const status = coverageStatuses[s.id]?.status;
          return [
            s.real_name,
            monthRecords.filter((a) => a.status === 'Present').length,
            monthRecords.filter((a) => a.status === 'Late').length,
            monthRecords.filter((a) => a.status === 'Absent').length,
            STATUS_LABELS[status] || '—',
            Number(s.points || 0),
          ];
        });
        return { columns: cols, rows: data };
      }
      default:
        return { columns: [], rows: [] };
    }
  }, [
    reportType, students, paymentRows, coverageStatuses, attendance, exams, examScores, homework, homeworkStatus,
    certificates, lessons, curriculumProgress, lessonProgress, allLessonProgress, filteredStudentIds, studentsById,
    fromDate, toDate, year, month,
  ]);

  const reportLabel = REPORT_TYPES.find((r) => r.key === reportType)?.label || 'Report';

  const handleExport = () => {
    downloadReportPdf({
      title: `${reportLabel} Report`,
      subtitle: `Dave Academy · generated ${new Date().toLocaleDateString()}`,
      columns,
      rows,
    });
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
        <p className="mt-1 text-sm text-ink/50">Reports include academy-wide financial data.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-ink/50">Generate and export reports as PDF.</p>
        </div>
        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Download size={16} /> Export PDF
        </button>
      </header>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {REPORT_TYPES.map((r) => (
          <button
            key={r.key}
            onClick={() => setReportType(r.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              reportType === r.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow-card">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-auto">
          <option value="">All levels</option>
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>Level {lvl}</option>
          ))}
        </select>
        {reportType === 'monthly' ? (
          <>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-auto">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Month {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input w-24"
            />
          </>
        ) : (
          ['attendance', 'exams', 'certificates', 'payments'].includes(reportType) && (
            <>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input w-auto" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input w-auto" />
            </>
          )
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3 font-semibold text-ink/70">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-ink/50">
                    <FileBarChart className="mx-auto mb-2 h-8 w-8 text-ink/20" />
                    No data for this report yet.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-2.5 text-ink/80">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
