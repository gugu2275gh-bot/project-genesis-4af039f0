import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getTranslations, interpolate, LanguageCode, Translations } from '@/i18n';
import { useAuth } from './AuthContext';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: Translations;
  formatMessage: (text: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'cb-asesoria-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  
  // Initialize language from storage, profile preference, or browser
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['pt', 'es', 'en', 'fr'].includes(stored)) {
      return stored as LanguageCode;
    }
    
    // Try to detect from browser
    const browserLang = navigator.language.split('-')[0];
    if (['pt', 'es', 'en', 'fr'].includes(browserLang)) {
      return browserLang as LanguageCode;
    }
    
    return 'pt';
  });

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
  };

  const t = getTranslations(language);

  const formatMessage = (text: string, params?: Record<string, string | number>) => {
    return params ? interpolate(text, params) : text;
  };

  // Set HTML lang attribute on mount and language change
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatMessage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
