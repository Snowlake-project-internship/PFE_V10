import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string | null;
  sender_email?: string | null;
}

const NotificationCenter = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchUnreadCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API}/api/feedback/notifications/unread-count`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  const fetchNotifications = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API}/api/feedback/notifications`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: NotificationItem) => !n.is_read).length);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${API}/api/feedback/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  if (!isAdmin) {
    return (
      <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative">
        <Bell size={20} className="text-slate-500 dark:text-slate-400 dark:hover:text-white transition-colors" />
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
        title={t('notifications.title')}
      >
        <Bell size={20} className="text-slate-500 dark:text-slate-400 dark:hover:text-white transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-snowflake rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_8px_var(--color-primary)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('notifications.unread', { count: unreadCount })}
              </p>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('notifications.loading')}</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('notifications.empty')}</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    !notification.is_read ? 'bg-snowflake/5' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-1.5 bg-snowflake/10 rounded-lg shrink-0 mt-0.5">
                      <MessageSquare size={14} className="text-snowflake" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {notification.sender_name || notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-snowflake rounded-full shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(notification.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
