import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, MessageSquare, RefreshCw, Reply, Send, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface NotificationItem {
  id: number;
  sender_id?: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string | null;
  sender_email?: string | null;
  organization_name?: string | null;
  sender_team?: string | null;
  feedback_id?: number | null;
  can_reply?: boolean;
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const NotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<number | null>(null);
  const [decisionError, setDecisionError] = useState('');
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const canUseNotifications = Boolean(user);
  const accountRequestCount = isAdmin
    ? notifications.filter((notification) => notification.type === 'account_approval').length
    : 0;

  const fetchUnreadCount = useCallback(async () => {
    if (!canUseNotifications) return;
    const response = await fetch(`${API}/api/feedback/notifications/unread-count`, { headers: authHeaders() }).catch(() => null);
    if (response?.ok) setUnreadCount((await response.json()).count ?? 0);
  }, [canUseNotifications]);

  const fetchNotifications = useCallback(async () => {
    if (!canUseNotifications) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API}/api/feedback/notifications`, { headers: authHeaders() });
      if (response.ok) {
        const data: NotificationItem[] = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter((notification) => !notification.is_read).length);
      }
    } catch {
      // Keep the current notification state when the backend is temporarily unavailable.
    } finally {
      setIsLoading(false);
    }
  }, [canUseNotifications]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 15000);
    return () => window.clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    } else {
      setReplyingToId(null);
      setReplyMessage('');
      setReplyError('');
    }
  }, [fetchNotifications, isOpen]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, []);

  const markRead = async (notification: NotificationItem) => {
    if (notification.is_read) return true;
    const response = await fetch(`${API}/api/feedback/notifications/${notification.id}/read`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!response.ok) return false;
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
    return true;
  };

  const decideAccount = async (notification: NotificationItem, decision: 'approve' | 'reject') => {
    if (!notification.sender_id || processingUserId !== null) return;
    setDecisionError('');
    setProcessingUserId(notification.sender_id);
    try {
      const response = await fetch(`${API}/api/users/${notification.sender_id}/${decision}`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || t('notifications.decisionError'));
      }
      await fetchNotifications();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : t('notifications.decisionError'));
    } finally {
      setProcessingUserId(null);
    }
  };

  const openAccountManagement = () => {
    setIsOpen(false);
    navigate(user?.role === 'super_admin' ? '/superadmin/users' : '/admin/users');
  };

  const openReply = async (notification: NotificationItem) => {
    setReplyError('');
    setReplyMessage('');
    setReplyingToId(notification.id);
    await markRead(notification);
  };

  const sendReply = async (notificationId: number) => {
    const message = replyMessage.trim();
    if (!message) {
      setReplyError(t('notifications.replyErrorEmpty'));
      return;
    }

    setIsSendingReply(true);
    setReplyError('');
    try {
      const response = await fetch(`${API}/api/feedback/notifications/${notificationId}/reply`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || t('notifications.replyErrorSubmit'));
      }
      setReplyingToId(null);
      setReplyMessage('');
      await fetchNotifications();
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : t('notifications.replyErrorSubmit'));
    } finally {
      setIsSendingReply(false);
    }
  };

  const getNotificationTitle = (notification: NotificationItem) => {
    if (notification.type === 'feedback_reply') return notification.title;
    return notification.sender_name || t('notifications.unknownUser');
  };

  if (!canUseNotifications) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button title={t('notifications.title')} onClick={() => setIsOpen((current) => !current)} className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {accountRequestCount > 0
                  ? t(accountRequestCount === 1 ? 'notifications.accountRequest' : 'notifications.accountRequests', { count: accountRequestCount })
                  : t('notifications.unread', { count: unreadCount })}
              </p>
            </div>
            <button title={t('notifications.refresh')} onClick={fetchNotifications} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {decisionError && (
              <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {decisionError}
              </p>
            )}
            {isLoading && notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('notifications.loading')}</p>}
            {!isLoading && notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('notifications.empty')}</p>}
            {notifications.map((notification) => {
              const isAccountRequest = notification.type === 'account_approval';
              const isProcessing = isAccountRequest && processingUserId === notification.sender_id;
              const isReplying = replyingToId === notification.id;

              if (isAccountRequest) {
                return (
                  <div key={notification.id} className={`border-b border-slate-100 px-4 py-4 dark:border-slate-800 ${notification.is_read ? '' : 'bg-sky-50 dark:bg-sky-500/10'}`}>
                    <div className="flex items-start gap-3">
                      <button title={t('notifications.manageRequest')} onClick={openAccountManagement} className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-600 transition-colors hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25">
                        <UserPlus size={16} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {notification.sender_name || t('notifications.unknownUser')}
                          </p>
                          {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{notification.sender_email}</p>
                        <dl className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex min-w-0 gap-1.5">
                            <dt className="shrink-0 font-semibold">{t('notifications.team')}:</dt>
                            <dd className="truncate">{notification.sender_team || t('notifications.notAssigned')}</dd>
                          </div>
                          <div className="flex min-w-0 gap-1.5">
                            <dt className="shrink-0 font-semibold">{t('notifications.organization')}:</dt>
                            <dd className="truncate">{notification.organization_name || t('notifications.notAssigned')}</dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => decideAccount(notification, 'approve')}
                            disabled={processingUserId !== null}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={14} />
                            {isProcessing ? t('notifications.processing') : t('notifications.accept')}
                          </button>
                          <button
                            onClick={() => decideAccount(notification, 'reject')}
                            disabled={processingUserId !== null}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X size={14} />
                            {isProcessing ? t('notifications.processing') : t('notifications.refuse')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={notification.id} className={`border-b border-slate-100 px-4 py-3 transition-colors dark:border-slate-800 ${notification.is_read ? '' : 'bg-sky-50 dark:bg-sky-500/10'}`}>
                  <div className="flex items-start gap-3">
                    <button
                      title={notification.is_read ? notification.title : t('notifications.unread', { count: 1 })}
                      onClick={() => markRead(notification)}
                      className="mt-0.5 rounded-lg bg-sky-100 p-2 text-sky-600 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25"
                    >
                      <MessageSquare size={14} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {getNotificationTitle(notification)}
                          </p>
                          {notification.sender_email && (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{notification.sender_email}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {notification.can_reply && (
                            <button
                              type="button"
                              onClick={() => openReply(notification)}
                              className="inline-flex min-h-7 items-center gap-1 rounded-md border border-sky-200 px-2 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/10"
                            >
                              <Reply size={13} />
                              {t('notifications.reply')}
                            </button>
                          )}
                          {!notification.is_read && <span className="h-2 w-2 rounded-full bg-red-500" />}
                        </div>
                      </div>
                      {(notification.sender_team || notification.organization_name) && (
                        <dl className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex min-w-0 gap-1.5">
                            <dt className="shrink-0 font-semibold">{t('notifications.team')}:</dt>
                            <dd className="truncate">{notification.sender_team || t('notifications.notAssigned')}</dd>
                          </div>
                          <div className="flex min-w-0 gap-1.5">
                            <dt className="shrink-0 font-semibold">{t('notifications.organization')}:</dt>
                            <dd className="truncate">{notification.organization_name || t('notifications.notAssigned')}</dd>
                          </div>
                        </dl>
                      )}
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">{notification.message}</p>
                      <p className="mt-2 text-[11px] text-slate-400">{new Date(notification.created_at).toLocaleString()}</p>

                      {isReplying && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <textarea
                            value={replyMessage}
                            onChange={(event) => setReplyMessage(event.target.value)}
                            placeholder={t('notifications.replyPlaceholder')}
                            className="min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          {replyError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-300">{replyError}</p>}
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingToId(null);
                                setReplyMessage('');
                                setReplyError('');
                              }}
                              className="min-h-8 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {t('upload.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => sendReply(notification.id)}
                              disabled={isSendingReply}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Send size={13} />
                              {isSendingReply ? t('notifications.replySending') : t('notifications.replySend')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
