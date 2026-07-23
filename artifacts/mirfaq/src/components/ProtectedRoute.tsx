import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@workspace/api-client-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useGetMe({
    query: {
      retry: false,
      enabled: !user,
      staleTime: 5 * 60 * 1000,
    }
  });

  useEffect(() => {
    if (data && !user) {
      setUser(data as AuthUser);
    }
  }, [data, user, setUser]);

  useEffect(() => {
    if (isError) {
      setLocation('/login');
    }
  }, [isError, setLocation]);

  const resolvedUser = user || data as AuthUser | undefined;

  if (isLoading && !resolvedUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحقق من الهوية...</p>
        </div>
      </div>
    );
  }

  if (!resolvedUser) return null;

  if (allowedRoles && !allowedRoles.includes(resolvedUser.role)) {
    setLocation('/login');
    return null;
  }

  return <>{children}</>;
}
