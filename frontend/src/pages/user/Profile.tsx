import { UserCircle, Mail, Lock, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Profile = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white transition-colors duration-300">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">{t('profile.title')}</h2>
        <p className="text-slate-600 dark:text-slate-400 transition-colors">{t('profile.subtitle')}</p>
      </div>

      <div className="bg-white dark:bg-slate-800/50 backdrop-blur border border-slate-200 dark:border-slate-700/50 rounded-2xl flex flex-col md:flex-row overflow-hidden transition-colors shadow-md dark:shadow-none">

        {/* Profile Sidebar */}
        <div className="w-full md:w-64 bg-slate-50 dark:bg-slate-800/80 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700/50 transition-colors">
          <div className="flex flex-col items-center text-center space-y-3 mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-snowflake-dark to-snowflake flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-snowflake/20">
              SE
            </div>
            <div>
              <h3 className="text-lg font-bold">Sayf Eddine</h3>
              <p className="text-sm text-snowflake">{t('profile.userType')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button className="w-full text-left px-4 py-2 bg-snowflake/10 text-snowflake rounded-lg text-sm font-medium">{t('profile.tabInfo')}</button>
            <button className="w-full text-left px-4 py-2 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg text-sm font-medium transition-colors">{t('profile.tabSecurity')}</button>
            <button className="w-full text-left px-4 py-2 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg text-sm font-medium transition-colors">{t('profile.tabNotifications')}</button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 p-8 space-y-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold border-b border-slate-200 dark:border-slate-700 pb-2 transition-colors">{t('profile.secInfo')}</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center transition-colors"><UserCircle className="w-4 h-4 mr-2" /> Full Name</label>
                <input type="text" defaultValue="Sayf" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors shadow-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center transition-colors"><Mail className="w-4 h-4 mr-2" /> Email Address</label>
                <input type="email" defaultValue="[sayfdin@.com]" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors shadow-sm" />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h4 className="text-lg font-semibold border-b border-slate-200 dark:border-slate-700 pb-2 transition-colors">{t('profile.secSecurity')}</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center transition-colors"><Lock className="w-4 h-4 mr-2" /> {t('auth.passwordLabel')}</label>
                <input type="password" placeholder="••••••••" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors shadow-sm" />
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button className="bg-snowflake hover:bg-snowflake-light text-white px-6 py-2.5 rounded-lg font-medium transition shadow-lg shadow-snowflake/20 flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              {t('profile.btnSave')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Profile;
