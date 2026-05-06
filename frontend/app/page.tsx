'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { ModeBadge, RoleBadge } from '@/components/Badge';
import { useLanguage } from '@/lib/i18n';

interface Workspace {
  id: string;
  name: string;
  mode: string;
  role: string;
  created_at: string;
}

export default function Home() {
  const { t } = useLanguage();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<Workspace[]>('/api/workspaces')
      .then((res) => setWorkspaces(res.data))
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <AppShell>
      <section className="surface mb-8 overflow-hidden p-5 sm:mb-10 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <p className="page-kicker mb-3">Research Git</p>
            <h1 className="gradient-text text-[42px] leading-[0.94] sm:text-[60px]">
              {t.dashboard.title}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--text-muted)]">
              {t.dashboard.subtitle}
            </p>
          </div>
          <Link href="/workspaces/new" className="btn-primary w-full shrink-0 justify-center sm:w-auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="hidden sm:inline">{t.dashboard.newWorkspace}</span>
            <span className="sm:hidden">{t.common.create}</span>
          </Link>
        </div>
      </section>

      {error && <div className="alert-error mb-6">{error}</div>}

      {loaded && workspaces.length === 0 && !error && (
        <div className="surface p-12 text-center">
          <p className="mb-4 text-[14px] text-[var(--text-muted)]">{t.dashboard.noWorkspaces}</p>
          <Link href="/workspaces/new" className="btn-primary">
            {t.dashboard.createFirst}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {workspaces.map((w) => (
          <Link
            key={w.id}
            href={`/w/${w.id}`}
            className="surface-hover group flex min-h-[172px] flex-col justify-between gap-6 p-4 sm:min-h-[186px] sm:p-5"
          >
            <div>
              <div className="mb-6 flex items-center justify-between gap-2 sm:mb-8">
                <ModeBadge mode={w.mode} />
                <RoleBadge role={w.role} />
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                {w.mode === 'team' ? t.modes.team : t.modes.personal}
              </p>
              <h3 className="truncate text-[18px] font-medium tracking-[-0.025em] text-[var(--text-primary)] sm:text-[19px]">
                {w.name}
              </h3>
            </div>
            <div className="flex items-end justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--surface-border-soft)' }}>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
                  {t.dashboard.created}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {new Date(w.created_at).toLocaleDateString(t.common.languageShort === '中' ? 'zh-CN' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]">
                {t.common.open}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
