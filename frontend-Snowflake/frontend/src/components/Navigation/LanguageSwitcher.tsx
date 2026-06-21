import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

const languages = [
  { code: 'en', label: 'English', flag: 'https://flagcdn.com/w40/gb.png' },
  { code: 'es', label: 'Español', flag: 'https://flagcdn.com/w40/es.png' },
  { code: 'fr', label: 'Français', flag: 'https://flagcdn.com/w40/fr.png' },
];

const LanguageSwitcher = ({ className }: { className?: string }) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Safely get the base language code (e.g. "en-US" -> "en")
  const currentLangCode = i18n.language ? i18n.language.substring(0, 2) : 'en';
  const currentLang = languages.find(l => l.code === currentLangCode) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className={clsx("relative inline-block text-left", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-transparent border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-snowflake"
      >
        <img src={currentLang.flag} alt={currentLang.label} className="w-5 h-auto rounded-sm shadow-sm" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 uppercase">{currentLang.code}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="py-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => selectLanguage(lang.code)}
                className={clsx(
                  "w-full text-left px-4 py-2 text-sm flex items-center space-x-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors",
                  currentLangCode === lang.code 
                    ? "bg-slate-50 dark:bg-slate-700/50 text-snowflake dark:text-snowflake-light font-medium" 
                    : "text-slate-700 dark:text-slate-300"
                )}
              >
                <img src={lang.flag} alt={lang.label} className="w-5 h-auto border border-black/10 rounded-sm shadow-sm" />
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
