import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as users from '../../modules/users';
import type { User } from '../../shared/types';

const AuthContext = createContext<{
  user: User | null; loading: boolean; refresh: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    const result = await users.getCurrentUser();
    setUser(result.ok ? result.data : null);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);
  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Контекст авторизации недоступен.');
  return auth;
}
