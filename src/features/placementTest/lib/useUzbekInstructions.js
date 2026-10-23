// useUzbekInstructions.js - students take the placement test with Uzbek
// instructions so the rules and controls are always understandable; the
// previous language choice is restored when they leave the placement pages.
// Question content stays English (it is an English assessment).
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export function useUzbekInstructions() {
  const { i18n } = useTranslation();
  const prevRef = useRef(i18n.language);
  useEffect(() => {
    prevRef.current = i18n.language;
    if (i18n.language !== 'uz') i18n.changeLanguage('uz');
    return () => {
      if (i18n.language === 'uz' && prevRef.current && prevRef.current !== 'uz') {
        i18n.changeLanguage(prevRef.current);
      }
    };
  }, [i18n]);
}
