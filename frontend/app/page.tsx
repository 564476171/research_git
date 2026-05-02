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
      <section className="mb-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_30px_90px_-42px_rgba(217,70,239,0.7)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.28em] text-fuchsia-200/70">
              Research Git
            </p>
            <h1 className="gradient-text text-[38px] font-semibold tracking-[-0.055em] sm:text-[56px]">
              {t.dashboard.title}
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-6 text-violet-100/68">
              {t.dashboard.subtitle}
            </p>
          </div>
          <Link href="/workspaces/new" className="btn-primary shrink-0">
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
          <p className="mb-4 text-[14px] text-violet-100/65">{t.dashboard.noWorkspaces}</p>
          <Link href="/workspaces/new" className="btn-primary">
            {t.dashboard.createFirst}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((w) => (
          <Link
            key={w.id}
            href={`/w/${w.id}`}
            className="surface-hover group p-5"
          >
            <div className="mb-8 flex items-center justify-between">
              <ModeBadge mode={w.mode} />
              <RoleBadge role={w.role} />
            </div>
            <h3 className="mb-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-white">
              {w.name}
            </h3>
            <p className="text-[12px] text-violet-100/55">
              {t.dashboard.created} {new Date(w.created_at).toLocaleDateString(t.common.languageShort === '中' ? 'zh-CN' : 'en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
