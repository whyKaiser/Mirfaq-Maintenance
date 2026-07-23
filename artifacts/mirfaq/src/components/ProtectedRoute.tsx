import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import type { ExtAuthUser } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      enabled: !user,
      staleTime: 5 * 60 * 1000,
    }
  });

  // Sync fetched user into auth context
  useEffect(() => {
    if (data && !user) {
      setUser(data as ExtAuthUser);
    }
  }, [data, user, setUser]);

  // Redirect to login when not authenticated
  useEffect(() => {
    if (isError) {
      setLocation('/login');
    }
  }, [isError, setLocation]);

  // Redirect to login when role is not allowed — MUST be in effect, never during render
  const resolvedUser = (user || data) as ExtAuthUser | undefined;
  useEffect(() => {
    if (resolvedUser && allowedRoles && !allowedRoles.includes(resolvedUser.role)) {
      setLocation('/login');
    }
  }, [resolvedUser, allowedRoles, setLocation]);

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

  // Role mismatch — render nothing while effect redirects
  if (allowedRoles && !allowedRoles.includes(resolvedUser.role)) return null;

  return <>{children}</>;
}
