// useMotivation.js
// Picks one motivational line per mount (i.e. per page load/refresh) via
// lazy initial state - re-renders from other state changes on the same
// page view don't reshuffle it, but a fresh load calls pickMotivation()
// again, which itself avoids repeating the immediately-previous pick.

import { useState } from 'react';
import { pickMotivation } from '../utils/motivation';

export function useMotivation() {
  const [quote] = useState(() => pickMotivation());
  return quote;
}
