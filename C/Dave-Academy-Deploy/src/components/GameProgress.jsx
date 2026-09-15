// GameProgress.jsx
// Small round-progress dots shared by every game's play screen (Word
// Scramble, Vocabulary Quiz, and any future game) - purely visual, paired
// with a text label ("Word 3 of 8") wherever it's used so progress is
// never communicated by the dots/color alone.
export default function GameProgress({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-1.5" role="presentation">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < current ? 'w-5 bg-brand-500' : i === current ? 'w-5 bg-brand-200' : 'w-1.5 bg-ink/10'
          }`}
        />
      ))}
    </div>
  );
}
