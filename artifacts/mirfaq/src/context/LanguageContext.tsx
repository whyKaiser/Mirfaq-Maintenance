import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'en' | 'ar';
const KEY = 'mirfaq-language';
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'en' ? 'Mirfaq | Maintenance demo' : 'مِرفق - صيانة عقارك، بوضوح وسهولة';
    try { localStorage.setItem(KEY, language); } catch { /* Preference remains in memory. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is missing');
  return context;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div role="group" aria-label={language === 'en' ? 'Language' : 'اللغة'} className="fixed bottom-4 right-4 z-[100] flex rounded-full border border-teal-700 bg-white p-1 text-sm shadow-lg" dir="ltr">
    <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} className={`rounded-full px-3 py-2 ${language === 'en' ? 'bg-teal-700 text-white' : 'text-slate-900'}`}>English</button>
    <button type="button" lang="ar" aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')} className={`rounded-full px-3 py-2 ${language === 'ar' ? 'bg-teal-700 text-white' : 'text-slate-900'}`}>العربية</button>
  </div>;
}
