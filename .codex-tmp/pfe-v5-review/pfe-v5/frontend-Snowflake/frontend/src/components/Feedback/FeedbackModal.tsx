import { useState } from 'react';
import { X, MessageSquare, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FeedbackModal = ({ isOpen, onClose }: FeedbackModalProps) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError(t('feedback.errorEmpty'));
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || t('feedback.errorSubmit'));
      }

      setSuccess(true);
      setMessage('');
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.errorSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-snowflake/10 rounded-lg">
              <MessageSquare size={20} className="text-snowflake" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('feedback.title')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('feedback.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center">
                <Send size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-green-600 dark:text-green-400 font-medium">{t('feedback.success')}</p>
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('feedback.placeholder')}
                rows={5}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake resize-none transition-colors"
                disabled={isSubmitting}
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex justify-end space-x-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t('upload.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-snowflake hover:bg-snowflake-dark text-white shadow-lg shadow-snowflake/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              <Send size={16} />
              <span>{isSubmitting ? t('feedback.sending') : t('feedback.submit')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
