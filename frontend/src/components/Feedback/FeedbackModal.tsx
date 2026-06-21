import { useState } from 'react';
import { CheckCircle2, MessageSquare, Send, X } from 'lucide-react';
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

  const close = () => {
    if (isSubmitting) return;
    setError('');
    setSuccess(false);
    onClose();
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError(t('feedback.errorEmpty'));
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || t('feedback.errorSubmit'));
      }

      setMessage('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.errorSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
              <MessageSquare size={19} />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{t('feedback.title')}</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('feedback.subtitle')}</p>
            </div>
          </div>
          <button title={t('upload.cancel')} onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 font-semibold text-emerald-600 dark:text-emerald-400">{t('feedback.success')}</p>
              <button onClick={close} className="mt-5 rounded-lg bg-snowflake px-5 py-2.5 text-sm font-semibold text-white hover:bg-snowflake-dark">
                {t('feedback.close')}
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('feedback.placeholder')}
                rows={6}
                maxLength={5000}
                disabled={isSubmitting}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="mt-2 flex items-start justify-between gap-4">
                <p className="text-sm text-red-500">{error}</p>
                <span className="shrink-0 text-xs text-slate-400">{message.length}/5000</span>
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
            <button onClick={close} disabled={isSubmitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              {t('upload.cancel')}
            </button>
            <button onClick={submit} disabled={isSubmitting || !message.trim()} className="inline-flex items-center gap-2 rounded-lg bg-snowflake px-5 py-2.5 text-sm font-semibold text-white hover:bg-snowflake-dark disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} />
              {isSubmitting ? t('feedback.sending') : t('feedback.submit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
