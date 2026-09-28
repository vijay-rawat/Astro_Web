import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AudioLines,
  Bot,
  ChevronDown,
  Database,
  FileText,
  LogOut,
  MessageSquare,
  Mic,
  Plug,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, useSession } from '../../auth/AuthProvider';
import { AstroMark } from '../AstroMark';
import { SkyPanel } from '../SkyPanel/SkyPanel';
import { Starfield } from '../Starfield/Starfield';
import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch';
import { VoicePassphraseDialog } from '../VoicePassphraseDialog/VoicePassphraseDialog';
import { agents } from '../../data/mock';
import { agentIcons } from '../../lib/agentIcons';
import styles from './AppShell.module.scss';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const nav: NavItem[] = [
  { to: '/', label: 'Ask Astro', icon: MessageSquare, end: true },
  { to: '/call', label: 'Voice call', icon: Mic },
  { to: '/meetings', label: 'Meetings', icon: Video },
  { to: '/briefs', label: 'Briefs', icon: FileText },
];

const manage: NavItem[] = [
  { to: '/knowledge', label: 'Knowledge', icon: Database },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/setup', label: 'Setup', icon: Plug },
];

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.link} ${styles.active}` : styles.link);

function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass}>
          <span className={styles.iconWrap}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

/** The signed-in person, with voice sign-in setup and sign-out. */
function UserMenu({ compact = false, onVoice }: { compact?: boolean; onVoice: () => void }) {
  const { user } = useSession();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const leave = async () => {
    setOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={compact ? `${styles.userMenu} ${styles.userMenuCompact}` : styles.userMenu} ref={root}>
      <button
        type="button"
        className={styles.user}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label={compact ? `Account: ${user.name}` : undefined}
      >
        <span className={styles.avatar}>{user.initials}</span>
        {!compact && (
          <>
            <span className={styles.userText}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.caption}>{user.roleLabel}</span>
            </span>
            <ChevronDown size={15} className={styles.chevron} aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <p className={styles.menuEmail}>{user.email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onVoice();
            }}
          >
            <AudioLines size={16} aria-hidden="true" />
            Voice sign-in
            <span className={user.voiceEnabled ? styles.on : styles.off}>{user.voiceEnabled ? 'On' : 'Off'}</span>
          </button>
          <button type="button" role="menuitem" onClick={leave}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { company, user } = useSession();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const openVoice = () => setVoiceOpen(true);
  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Astro navigation">
        <div className={styles.brand}>
          <AstroMark size={30} />
          <span className={styles.wordmark}>Astro</span>
        </div>

        <button type="button" className={styles.company}>
          <span className={styles.companyBadge}>{company.initials}</span>
          <span className={styles.companyText}>
            <span className={styles.companyName}>{company.name}</span>
            <span className={styles.caption}>{company.presetLabel} workspace</span>
          </span>
          <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
        </button>

        <div className={styles.links}>
          <NavLinks items={nav} />
        </div>

        {user.canManage && (
          <div className={styles.links}>
            <h2 className={styles.groupTitle}>Manage</h2>
            <NavLinks items={manage} />
          </div>
        )}

        <div className={styles.agents}>
          <div className={styles.agentsHead}>
            <h2>Agents</h2>
            <span className={styles.ready}>{agents.length} ready</span>
          </div>
          <ul>
            {agents.map((agent, i) => {
              const Icon = agentIcons[agent.id];
              return (
                <li key={agent.id}>
                  <Icon size={16} aria-hidden="true" />
                  <span className={styles.agentName}>{agent.name}</span>
                  <span className={styles.beacon} style={{ animationDelay: `${i * 0.7}s` }} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.railFooter}>
          <SkyPanel />
          <ThemeSwitch />
        </div>

        <div className={styles.mobileTheme}>
          <ThemeSwitch compact />
          <UserMenu compact onVoice={openVoice} />
        </div>

        <div className={styles.userSlot}>
          <UserMenu onVoice={openVoice} />
        </div>
      </nav>

      <div className={styles.content}>
        <Starfield />
        <Outlet />
      </div>
      <VoicePassphraseDialog open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}
