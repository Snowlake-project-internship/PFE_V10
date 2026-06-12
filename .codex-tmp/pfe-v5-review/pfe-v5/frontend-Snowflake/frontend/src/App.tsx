import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/Navigation/ProtectedRoute';

import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

import UploadCenter from './pages/user/UploadCenter';
import UserDashboard from './pages/user/UserDashboard';
import ImportHistory from './pages/user/ImportHistory';
import LogFiles from './pages/user/LogFiles';
import Profile from './pages/user/Profile';

import AdminDashboard from './pages/admin/AdminDashboard';
import GlobalImports from './pages/admin/GlobalImports';
import UserManagement from './pages/admin/UserManagement';
import ManageAdmins from './pages/admin/ManageAdmins';
import AllOrganizations from './pages/admin/AllOrganizations';
import OrganizationDetails from './pages/admin/OrganizationDetails';

const RootRedirect = () => {
  const { user } = useAuth();
  return (
    <Navigate
      to={user?.role === 'super_admin' ? '/superadmin/dashboard' : user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'}
      replace
    />
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Protected Routes Wrapper */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<RootRedirect />} />
            
            {/* Shared / User Routes */}
            <Route path="upload" element={<ProtectedRoute allowedRoles={['user', 'admin']}><UploadCenter /></ProtectedRoute>} />
            <Route path="dashboard" element={<ProtectedRoute allowedRoles={['user', 'admin']}><UserDashboard /></ProtectedRoute>} />
            <Route path="history" element={<ProtectedRoute allowedRoles={['user', 'admin']}><ImportHistory /></ProtectedRoute>} />
            <Route path="log-files" element={<ProtectedRoute allowedRoles={['user', 'admin']}><LogFiles /></ProtectedRoute>} />
            <Route path="logs" element={<Navigate to="/log-files" replace />} />
            <Route path="profile" element={<ProtectedRoute allowedRoles={['user', 'admin']}><Profile /></ProtectedRoute>} />
            
            {/* Protected Admin Routes */}
            <Route path="admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="admin/imports" element={<ProtectedRoute allowedRoles={['admin']}><GlobalImports /></ProtectedRoute>} />
            <Route path="admin/users" element={<ProtectedRoute allowedRoles={['admin']}><UserManagement /></ProtectedRoute>} />
            <Route path="superadmin/dashboard" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="superadmin/admins" element={<ProtectedRoute allowedRoles={['super_admin']}><ManageAdmins /></ProtectedRoute>} />
            <Route path="superadmin/organizations" element={<ProtectedRoute allowedRoles={['super_admin']}><AllOrganizations /></ProtectedRoute>} />
            <Route path="superadmin/organizations/:organizationId" element={<ProtectedRoute allowedRoles={['super_admin']}><OrganizationDetails /></ProtectedRoute>} />
            <Route path="superadmin/organizations/:organizationId/log-files" element={<ProtectedRoute allowedRoles={['super_admin']}><LogFiles /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
