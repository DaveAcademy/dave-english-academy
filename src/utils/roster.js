// roster.js
// Parses pasted, pipe-delimited roster text into student rows. Recognizes
// two formats and ignores anything else (headers, section titles, blank
// lines, "---" dividers) so people can paste messy lists safely:
//   Name| English name| Level| Payment day
//   Name| English name| Level| Payment day| Group
export function parseRosterText(text) {
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length !== 4 && parts.length !== 5) continue;
    const [realName, englishName, level, deadlineStr, group] = parts;
    if (!['A', 'B', 'C'].includes(level)) continue;
    const deadline = parseInt(deadlineStr, 10);
    if (!realName || !Number.isInteger(deadline) || deadline < 1 || deadline > 31) continue;
    rows.push({
      real_name: realName,
      english_name: englishName && englishName !== '(Not selected yet)' ? englishName : '',
      level,
      payment_deadline: deadline,
      group_name: group || '',
    });
  }
  return rows;
}

export function studentDedupeKey(s) {
  return `${(s.real_name || '').trim().toLowerCase()}|${(s.english_name || '').trim().toLowerCase()}|${s.level}`;
}
