import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export type Role = "user" | "admin" | "super_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organization_id?: number | null;
  organization_name?: string | null;
  team?: string | null;
  approval_status?: string;
  is_active?: boolean;
  last_login?: string | null;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isTokenExpired = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

const clearStoredSession = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
};

const userFromApi = (data: any, fallbackEmail?: string): User => ({
  id: String(data.user_id ?? data.id),
  name: data.name ?? data.username ?? fallbackEmail ?? "User",
  email: data.email ?? fallbackEmail ?? "",
  role: data.role as Role,
  organization_id: data.organization_id ?? null,
  organization_name: data.organization_name ?? null,
  team: data.team ?? null,
  approval_status: data.approval_status ?? "APPROVED",
  is_active: data.is_active ?? true,
  last_login: data.last_login ?? null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");
    if (storedUser && storedToken) {
      try {
        if (isTokenExpired(storedToken)) {
          clearStoredSession();
          setIsLoading(false);
          return;
        }
        setUser(JSON.parse(storedUser));
      } catch {
        clearStoredSession();
      }
    }
    setIsLoading(false);
  }, []);

  const refreshUser = async () => {
    const token = localStorage.getItem("token");
    if (!token || isTokenExpired(token)) {
      clearStoredSession();
      setUser(null);
      return;
    }
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearStoredSession();
      setUser(null);
      return;
    }
    const freshUser = userFromApi(await res.json());
    setUser(freshUser);
    localStorage.setItem("user", JSON.stringify(freshUser));
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return {
          success: false,
          error: data?.detail || "Invalid email or password",
        };
      }

      const data = await res.json();
      const authenticatedUser = userFromApi(data, email);
      setUser(authenticatedUser);
      localStorage.setItem("user", JSON.stringify(authenticatedUser));
      localStorage.setItem("token", data.access_token);
      return { success: true };
    } catch (err) {
      console.error("Login error:", err);
      return { success: false, error: "Connection error. Make sure backend is running." };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    clearStoredSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
        isLoading,
        isAdmin: user?.role === "admin" || user?.role === "super_admin",
        isSuperAdmin: user?.role === "super_admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
