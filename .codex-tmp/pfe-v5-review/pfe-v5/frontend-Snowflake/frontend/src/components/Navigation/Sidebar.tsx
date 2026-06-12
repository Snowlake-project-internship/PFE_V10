import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { UploadCloud, LayoutDashboard, History, UserCircle, MessageSquare, Database, ShieldAlert, Globe, Users, X, LogOut, FileText, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import FeedbackModal from '../Feedback/FeedbackModal';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const isUser = user?.role === 'user';
  
  const userNavItems = [
    { label: t('sidebar.uploadCenter'), path: '/upload', icon: UploadCloud },
    { label: t('sidebar.dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { label: t('sidebar.importHistory'), path: '/history', icon: History },
    { label: t('sidebar.logFiles'), path: '/log-files', icon: FileText },
    { label: t('sidebar.profile'), path: '/profile', icon: UserCircle },
  ];
  const superAdminItems = [
    { label: 'Super Admin Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard },
    { label: t('sidebar.manageAdmins'), path: '/superadmin/admins', icon: ShieldAlert },
    { label: t('sidebar.allOrganizations'), path: '/superadmin/organizations', icon: Building2 },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <aside 
        className={clsx(
          "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex transition-colors",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="flex items-center">
            <Database className="text-snowflake mr-3" size={24} />
            <span className="text-lg font-bold tracking-wide text-slate-900 dark:text-white transition-colors duration-300">{t('layout.shortTitle')}</span>
          </div>
          {/* Close Menu Button for Mobile */}
          <button 
            className="md:hidden text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1 flex flex-col">
          {user?.role !== 'admin' && (
            <div className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-4 px-2">
              {user?.role === 'super_admin' ? t('sidebar.superAdminControls') : t('sidebar.userMenu')}
            </div>
          )}
          {(user?.role === 'super_admin' ? superAdminItems : user?.role === 'user' ? userNavItems : []).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  twMerge(
                    clsx(
                      'flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group font-medium text-sm',
                      isActive
                        ? 'bg-snowflake/10 text-snowflake shadow-[inset_4px_0_0_0_var(--color-primary)]'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                    )
                  )
                }
              >
                <Icon size={18} className="group-hover:scale-110 transition-transform duration-200" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {user?.role === 'admin' && (
            <>
              <div className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-4 px-2">
                {t('sidebar.adminControls')}
              </div>
              {[
                { label: t('sidebar.platformStats'), path: '/admin/dashboard', icon: ShieldAlert },
                { label: t('sidebar.globalImports'), path: '/admin/imports', icon: Globe },
                { label: t('sidebar.manageUsers'), path: '/admin/users', icon: Users },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      twMerge(
                        clsx(
                          'flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group font-medium text-sm',
                          isActive
                            ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-[inset_4px_0_0_0_#9333ea] dark:shadow-[inset_4px_0_0_0_#c084fc]'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                        )
                      )
                    }
                  >
                    <Icon size={18} className="group-hover:scale-110 transition-transform duration-200" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </>
          )}

          {/* Quick Action / Feedback / Logout on mobile */}
          <div className="mt-auto pt-8">
            <button 
              onClick={logout}
              className="sm:hidden w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors mb-3"
            >
              <LogOut size={16} />
              <span>{t('sidebar.logOut')}</span>
            </button>

            {isUser && (
              <button
                onClick={() => setIsFeedbackOpen(true)}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                <MessageSquare size={16} />
                <span>{t('sidebar.sendFeedback')}</span>
              </button>
            )}
          </div>
        </nav>
      </aside>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </>
  );
};

export default Sidebar;
