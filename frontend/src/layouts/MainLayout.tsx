import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Navigation/Sidebar';
import AIChatbotBubble from '../components/Chatbot/AIChatbotBubble';
import { User, Menu, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/Navigation/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import NotificationCenter from '../components/Notifications/NotificationCenter';

const MainLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme === 'dark';
    return true; // default dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  return (
    <div className="flex h-screen bg-transparent text-slate-800 dark:text-slate-200 font-sans overflow-hidden transition-colors duration-300">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-y-auto w-full">
        {/* Top App Bar */}
        <header className="h-16 px-4 sm:px-6 lg:px-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur sticky top-0 z-10 transition-colors duration-300">
          <div className="flex items-center">
            <button 
              className="md:hidden mr-4 p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white hidden sm:block">{t('layout.title')}</h1>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white sm:hidden border-l border-slate-200 dark:border-slate-700 pl-4">{t('layout.shortTitle')}</h1>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4">
            <LanguageSwitcher className="hidden sm:flex" />

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 dark:hover:text-white"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <NotificationCenter />

            <button 
              onClick={logout}
              className="p-2 hidden sm:block rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400"
              title="Log out"
            >
              <LogOut size={20} />
            </button>

            <div className="flex items-center space-x-2 pl-2 sm:pl-4 border-l border-slate-200 dark:border-slate-800 cursor-pointer transition-colors duration-300">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-snowflake-dark to-snowflake flex items-center justify-center text-sm font-bold text-white shadow-lg">
                <User size={16} />
              </div>
              <span className="text-sm font-medium hidden sm:block text-slate-700 dark:text-slate-200">{user?.name || 'Sayf'}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-10 w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      
      {/* Global Floating Components */}
      <AIChatbotBubble />
    </div>
  );
};

export default MainLayout;
