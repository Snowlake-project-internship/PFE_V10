import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, UserPlus, Building, BriefcaseBusiness } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const Register = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [team, setTeam] = useState('');
  const [customTeam, setCustomTeam] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: name,
          email,
          password,
          organization_name: organizationName,
          team: team === 'Other' ? customTeam : team,
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || 'Registration failed');
        return;
      }

      const data = await res.json();
      alert(data.message || 'Account created and waiting for administrator approval.');
      navigate('/login');
    } catch (err) {
      alert('Connection error. Make sure backend is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <h2 className="text-2xl font-bold mb-6 text-center">{t('auth.createAccount')}</h2>
      
      <form onSubmit={handleRegister} className="space-y-4">

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="user name"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            {t('auth.emailLabel')}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="user email"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            {t('auth.passwordLabel')}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
        </div>

        {/* Organization */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Organization Name
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake transition-colors"
              placeholder="user organization"
              required
            />
          </div>
        </div>

        {/* Team */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Team / Department
          </label>
          <div className="relative">
            <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <select
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-900 outline-none transition-colors focus:border-snowflake focus:ring-1 focus:ring-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              required
            >
              <option value="">Select your team</option>
              {['Development', 'Engineering', 'DevOps', 'Data', 'QA', 'Security', 'Product', 'Support', 'Other'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          {team === 'Other' && (
            <input
              type="text"
              value={customTeam}
              onChange={(event) => setCustomTeam(event.target.value)}
              placeholder="Enter your team"
              minLength={2}
              maxLength={100}
              required
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-900 outline-none transition-colors focus:border-snowflake focus:ring-1 focus:ring-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
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
              <UserPlus className="w-5 h-5 mr-2" />
              {t('auth.signUp')}
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-snowflake hover:text-snowflake-dark transition-colors">
          {t('auth.signInInstead')}
        </Link>
      </div>
    </div>
  );
};

export default Register;
