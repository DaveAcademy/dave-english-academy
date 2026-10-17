// Small shared helper so Writing (exam_type 'Written') and Speaking
// (exam_type 'Oral') exams read as distinct major assessments everywhere
// they're listed, instead of a generic "Exam" icon/label - used by
// MyExams.jsx, LessonHub.jsx, and MyProgress.jsx.
export function examTypeIcon(examType) {
  if (examType === 'Written') return '✍️';
  if (examType === 'Oral') return '🗣️';
  return '📝';
}
