'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LanguageToggle, useLanguage } from '@/lib/i18n';
import { ThemeToggle } from '@/lib/theme';
import Avatar from './Avatar';
import Brand from './Brand';

interface Workspace {
  id: string;
  name: string;
  mode: string;
  role: string;
  created_at: string;
}

function ChevronDown({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function WorkspaceSwitcher() {
  const params = useParams<{ wid?: string }>();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<Workspace[]>('/api/workspaces')
      .then((r) => setWorkspaces(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = workspaces.find((w) => w.id === params?.wid);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="chrome-button max-w-[9.5rem] sm:max-w-[15rem]"
      >
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)] sm:inline">
          {t.common.workspace}
        </span>
        <span className="truncate font-medium text-[var(--text-primary)]">
          {current?.name ?? t.common.workspaces}
        </span>
        <ChevronDown />
      </button>

      {open && (
        <div className="menu-panel absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden">
          <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
            {t.common.workspaces}
          </div>
          <ul className="max-h-72 overflow-y-auto px-1 pb-1">
            {workspaces.map((w) => {
              const active = w.id === params?.wid;
              return (
                <li key={w.id}>
                  <Link
                    href={`/w/${w.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[13px] transition-all ${
                      active
                        ? 'bg-[var(--surface-bg)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="truncate font-medium">{w.name}</span>
                    <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                      {w.mode === 'team' ? t.modes.team : t.modes.personal}
                    </span>
                  </Link>
                </li>
              );
            })}
            {workspaces.length === 0 && (
              <li className="px-3 py-3 text-center text-[13px] text-[var(--text-faint)]">
                {t.common.noneYet}
              </li>
            )}
          </ul>
          <div className="border-t px-2 py-2" style={{ borderColor: 'var(--surface-border)' }}>
            <Link
              href="/workspaces/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--surface-bg)]"
            >
              <PlusIcon />
              {t.dashboard.newWorkspace}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { logout, user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full transition-all hover:opacity-85"
        aria-label={t.common.account}
      >
        <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="md" />
      </button>
      {open && (
        <div className="menu-panel absolute right-0 top-full z-20 mt-2 w-64">
          <div className="px-3 pb-3 pt-2">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {user?.display_name || user?.email || t.common.account}
                </div>
                {user?.email && <div className="truncate text-[12px] text-[var(--text-faint)]">{user.email}</div>}
              </div>
            </div>
            {user?.is_global_admin && (
              <div className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-bg)' }}>
                {t.roles.globalAdmin}
              </div>
            )}
          </div>
          <div className="border-t pt-2" style={{ borderColor: 'var(--surface-border)' }}>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex h-10 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
            >
              {t.common.profile}
            </Link>
            {user?.is_global_admin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex h-10 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
              >
                {t.common.adminConsole}
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex h-10 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
            >
              {t.common.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthed, loading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (!loading && !isAuthed) router.push('/login');
  }, [isAuthed, loading, router]);

  if (loading || !isAuthed) {
    return (
      <div className="app-gradient flex min-h-screen items-center justify-center px-6">
        <div className="surface px-5 py-3 text-[13px] font-medium text-[var(--text-secondary)]">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="app-gradient">
      <header className="sticky top-0 z-10 border-b" style={{ borderColor: 'var(--surface-border)', background: 'var(--header-bg)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link href="/" className="flex shrink-0 items-center">
              <Brand size="md" responsive />
            </Link>
            <span className="hidden text-[var(--text-faint)] sm:inline">/</span>
            <WorkspaceSwitcher />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center rounded-full border border-[var(--surface-border)] bg-[var(--canvas)] p-1 sm:flex">
              <ThemeToggle className="h-8 border-0 bg-transparent px-2.5 shadow-none hover:shadow-none sm:w-auto" />
              <LanguageToggle className="h-8 border-0 bg-transparent px-2.5 shadow-none hover:shadow-none" />
            </div>
            <ThemeToggle className="w-9 justify-center px-0 sm:hidden" />
            <LanguageToggle className="px-2.5 sm:hidden" />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
