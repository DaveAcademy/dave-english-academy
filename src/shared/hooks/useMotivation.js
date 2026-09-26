// useMotivation.js
// Picks one motivational line per mount (i.e. per page load/refresh) via
// lazy initial state - re-renders from other state changes on the same
// page view don't reshuffle it, but a fresh load calls pickMotivation()
// again, which itself avoids repeating the immediately-previous pick.
// Also re-picks (in the new language) if i18n.language changes while
// mounted, so a live language switch doesn't leave an English quote
// showing on an otherwise-Uzbek dashboard.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pickMotivation } from '../utils/motivation';

export function useMotivation() {
  const { i18n } = useTranslation();
  const [quote, setQuote] = useState(() => pickMotivation(i18n.language));
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setQuote(pickMotivation(i18n.language));
  }, [i18n.language]);

  return quote;
}
