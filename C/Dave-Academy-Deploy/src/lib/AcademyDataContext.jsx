// AcademyDataContext.jsx

import { createContext, useContext } from 'react';
import { useAcademyData } from './useAcademyData';

const AcademyDataContext = createContext(null);

export function AcademyDataProvider({ children }) {
  const data = useAcademyData();
  return <AcademyDataContext.Provider value={data}>{children}</AcademyDataContext.Provider>;
}

export function useAcademy() {
  const ctx = useContext(AcademyDataContext);
  if (!ctx) throw new Error('useAcademy must be used inside AcademyDataProvider');
  return ctx;
}
