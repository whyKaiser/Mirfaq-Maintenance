import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey } from '@workspace/api-client-react';
import type { AuthUser } from '@workspace/api-client-react';

// Phase 3: the generated AuthUser now includes org fields from the updated OpenAPI spec.
// ExtAuthUser narrows some optional fields to required (the backend always sends them).
export type ExtAuthUser = AuthUser & {
  organizationName: string;  // generated has it optional; backend always sends it
  brandColor: string;        // same
};

interface AuthContextValue {
  user: ExtAuthUser | null;
  setUser: (user: ExtAuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<ExtAuthUser | null>(null);
  const queryClient = useQueryClient();

  const setUser = useCallback((u: ExtAuthUser | null) => {
    setUserState(u);
    if (u) {
      queryClient.setQueryData(getGetMeQueryKey(), u);
    }
  }, [queryClient]);

  const logout = useCallback(() => {
    setUserState(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
