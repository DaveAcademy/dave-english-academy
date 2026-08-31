// gameRecordFormat.js
// Shared "Real Name (English Name)" formatting for leaderboard rows -
// matches the convention already used inline in Recognition.jsx, given a
// dedicated function here since get_game_best_records() (0147) is the
// first RPC to return english_name alongside real_name for display.
export function formatStudentDisplayName(realName, englishName) {
  const name = (realName || '').trim();
  const eng = (englishName || '').trim();
  return eng ? `${name} (${eng})` : name;
}
