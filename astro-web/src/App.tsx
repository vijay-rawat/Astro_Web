import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BootScreen, RequireAuth, RequireManage } from './auth/RequireAuth';

// Every screen is its own chunk: the Login page loads without the app, and each page downloads
// only when first opened (the Login page prefetches the shell while you sign in).
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const AuthPage = lazy(() => import('./pages/AuthPage'));
const AppShell = named(() => import('./components/AppShell/AppShell'), 'AppShell');
const AskPage = named(() => import('./pages/AskPage'), 'AskPage');
const CallPage = named(() => import('./pages/CallPage'), 'CallPage');
const MeetingsPage = named(() => import('./pages/MeetingsPage'), 'MeetingsPage');
const MeetLivePage = named(() => import('./pages/MeetLivePage'), 'MeetLivePage');
const MeetRecapPage = named(() => import('./pages/MeetRecapPage'), 'MeetRecapPage');
const BriefsPage = named(() => import('./pages/BriefsPage'), 'BriefsPage');
const KnowledgePage = named(() => import('./pages/KnowledgePage'), 'KnowledgePage');
const AgentsPage = named(() => import('./pages/AgentsPage'), 'AgentsPage');
const SetupPage = named(() => import('./pages/SetupPage'), 'SetupPage');

const signedIn = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;
const admin = (page: ReactNode) => <RequireManage>{page}</RequireManage>;

export default function App() {
  return (
    <Suspense fallback={<BootScreen />}>
      <Routes>
        <Route path="login" element={<AuthPage />} />
        <Route element={signedIn(<AppShell />)}>
          <Route index element={<AskPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meetings/:meetingId/recap" element={<MeetRecapPage />} />
          <Route path="briefs" element={<BriefsPage />} />
          <Route path="knowledge" element={admin(<KnowledgePage />)} />
          <Route path="agents" element={admin(<AgentsPage />)} />
          <Route path="setup" element={admin(<SetupPage />)} />
        </Route>
        {/* Full-screen, outside the app shell */}
        <Route path="call" element={signedIn(<CallPage />)} />
        <Route path="meetings/:meetingId/live" element={signedIn(<MeetLivePage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
