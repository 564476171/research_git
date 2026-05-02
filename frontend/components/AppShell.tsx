'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
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
        onClick={() => setOpen(!open)}
        className="flex h-9 max-w-[14rem] items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 text-[13px] text-violet-100/80 backdrop-blur-xl transition-all hover:border-fuchsia-300/35 hover:bg-white/15 hover:text-white"
      >
        <span className="truncate font-semibold text-white">
          {current?.name ?? t.common.workspaces}
        </span>
        <ChevronDown />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-3xl border border-white/15 bg-slate-950/80 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-100/55">
            {t.common.workspaces}
          </div>
          <ul className="max-h-72 overflow-y-auto px-2 pb-2">
            {workspaces.map((w) => {
              const active = w.id === params?.wid;
              return (
                <li key={w.id}>
                  <Link
                    href={`/w/${w.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex h-10 items-center justify-between gap-2 rounded-2xl px-3 text-[13px] transition-all ${
                      active
                        ? 'bg-gradient-to-r from-violet-500/25 to-fuchsia-500/25 text-white'
                        : 'text-violet-100/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="truncate font-semibold">{w.name}</span>
                    <span className="shrink-0 text-[11px] capitalize text-violet-100/55">
                      {w.mode === 'team' ? t.modes.team : t.modes.personal}
                    </span>
                  </Link>
                </li>
              );
            })}
            {workspaces.length === 0 && (
              <li className="px-2 py-3 text-center text-[13px] text-violet-100/55">
                {t.common.noneYet}
              </li>
            )}
          </ul>
          <div className="border-t border-white/10 p-2">
            <Link
              href="/workspaces/new"
              onClick={() => setOpen(false)}
              className="flex h-10 items-center gap-2 rounded-2xl px-3 text-[13px] font-semibold text-white transition-all hover:bg-white/10"
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
        onClick={() => setOpen(!open)}
        className="rounded-full transition-all hover:-translate-y-0.5"
        aria-label={t.common.account}
      >
        <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="md" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-3xl border border-white/15 bg-slate-950/85 p-2 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div className="px-3 pb-3 pt-2">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">
                  {user?.display_name || user?.email || t.common.account}
                </div>
                {user?.email && <div className="truncate text-[12px] text-violet-100/50">{user.email}</div>}
              </div>
            </div>
            {user?.is_global_admin && (
              <div className="mt-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
                {t.roles.globalAdmin}
              </div>
            )}
          </div>
          <div className="border-t border-white/10 pt-2">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] font-semibold text-violet-100/80 transition-all hover:bg-white/10 hover:text-white"
            >
              {t.common.profile}
            </Link>
            {user?.is_global_admin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] font-semibold text-violet-100/80 transition-all hover:bg-white/10 hover:text-white"
              >
                {t.common.adminConsole}
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] font-semibold text-violet-100/80 transition-all hover:bg-white/10 hover:text-white"
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
      <div className="app-gradient flex min-h-screen items-center justify-center text-[13px] font-semibold text-violet-100/70">
        <div className="glass-panel px-5 py-3">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="app-gradient min-h-screen">
      <div className="gradient-orb -left-24 top-12 h-72 w-72 bg-violet-500/30" />
      <div className="gradient-orb right-0 top-24 h-80 w-80 bg-fuchsia-500/20" />
      <div className="gradient-orb bottom-0 left-1/3 h-80 w-80 bg-cyan-500/10" />
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/40 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center">
              <Brand size="md" responsive />
            </Link>
            <span className="hidden text-violet-100/25 sm:inline">/</span>
            <WorkspaceSwitcher />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="relative z-[1] mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
