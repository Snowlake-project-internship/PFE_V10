import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, Role } from '../../contexts/AuthContext';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Role[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-snowflake border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Redirect unauthenticated users to login page
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect authenticated users trying to access unauthorized role routes
    return <Navigate to={user.role === 'super_admin' ? '/superadmin/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/upload'} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
