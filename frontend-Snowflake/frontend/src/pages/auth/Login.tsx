import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        const storedUser = localStorage.getItem('user');
        const role = storedUser ? JSON.parse(storedUser).role : 'user';
        navigate(role === 'admin' || role === 'super_admin' ? '/admin/dashboard' : '/dashboard');
      } else {
        setError(result.error || 'Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <h2 className="text-2xl font-bold mb-6 text-center">{t('auth.welcome')}</h2>
      
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg flex items-center text-sm">
          <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">{t('auth.emailLabel')}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="admin@gmail.com"
              required
            />
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">{t('auth.passwordLabel')}</label>
            <a href="#" className="text-xs font-medium text-snowflake hover:text-snowflake-dark transition-colors">{t('auth.forgotPassword')}</a>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          className={clsx(
            "w-full bg-snowflake hover:bg-snowflake-dark text-white font-medium py-2.5 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-snowflake/20 mt-6",
            isSubmitting && "opacity-70 cursor-wait"
          )}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <LogIn className="w-5 h-5 mr-2" />
              {t('auth.signIn')}
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-snowflake hover:text-snowflake-dark transition-colors">
          {t('auth.createNow')}
        </Link>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 text-center">
        <p>Demo Credentials:</p>
        <p className="mt-1">Admin: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">admin@gmail.com</span> / <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">123456</span></p>
        <p className="mt-1">User: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">user@gmail.com</span> / <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">123456</span></p>
      </div>
    </div>
  );
};

export default Login;
