import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AstroMark } from '../components/AstroMark';
import { useAuth } from './AuthProvider';
import styles from './RequireAuth.module.scss';

/** While /api/me loads (usually a few milliseconds) show a quiet mark, never a flash of the app. */
export function BootScreen() {
  return (
    <div className={styles.boot} role="status" aria-label="Loading Astro">
      <AstroMark size={40} />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BootScreen />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

/** Knowledge, Agents and Setup: admins only. The API checks this too. */
export function RequireManage({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session?.user.canManage) return <Navigate to="/" replace />;
  return <>{children}</>;
}
