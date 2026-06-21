import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/Navigation/LanguageSwitcher';

const AuthLayout = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();

  // If already authenticated, bounce them to their appropriate dashboard
  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin/dashboard' : '/upload'} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0f172a] transition-colors duration-300 text-slate-900 dark:text-white p-4 relative">
      <div className="absolute top-4 right-4 sm:top-8 sm:right-8">
        <LanguageSwitcher />
      </div>
      
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-snowflake/10 rounded-full">
              <Database className="text-snowflake w-10 h-10" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white transition-colors duration-300">
            {t('layout.shortTitle')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 transition-colors duration-300">
            {t('layout.secureLoader')}
          </p>
        </div>
        
        <div className="bg-white dark:bg-slate-800/50 backdrop-blur border border-slate-200 dark:border-slate-700/50 p-8 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none transition-colors duration-300">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
