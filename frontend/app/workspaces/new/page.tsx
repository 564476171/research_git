'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useLanguage } from '@/lib/i18n';

type Mode = 'personal' | 'team';

type ModeCopy = {
  title: string;
  desc: string;
  features: readonly string[];
};

const ICONS: Record<Mode, React.ReactNode> = {
  personal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  ),
  team: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export default function NewWorkspacePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>('personal');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const modes: Array<{ value: Mode } & ModeCopy> = [
    {
      value: 'personal',
      title: t.newWorkspace.personalTitle,
      desc: t.newWorkspace.personalDesc,
      features: t.newWorkspace.personalFeatures,
    },
    {
      value: 'team',
      title: t.newWorkspace.teamTitle,
      desc: t.newWorkspace.teamDesc,
      features: t.newWorkspace.teamFeatures,
    },
  ];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t.newWorkspace.required);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/api/workspaces', { name: name.trim(), mode });
      router.push(`/w/${res.data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="w-full max-w-3xl">
          <Link href="/" className="btn-ghost -ml-2 mb-6">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t.newWorkspace.back}
          </Link>

          <div className="surface p-6 sm:p-8">
            <header className="mb-8">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.24em] text-fuchsia-200/70">
                Mode selection
              </p>
              <h1 className="gradient-text text-[36px] font-semibold tracking-[-0.05em] sm:text-[48px]">
                {t.newWorkspace.title}
              </h1>
              <p className="mt-2 text-[14px] leading-6 text-violet-100/65">
                {t.newWorkspace.subtitle}
              </p>
            </header>

            <form onSubmit={onSubmit} className="space-y-8">
              <section>
                <label className="label-field mb-3">{t.newWorkspace.mode}</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {modes.map((m) => {
                    const active = mode === m.value;
                    return (
                      <button
                        type="button"
                        key={m.value}
                        onClick={() => setMode(m.value)}
                        className={`text-left rounded-3xl border p-5 transition-all ${
                          active
                            ? 'border-fuchsia-300/50 bg-gradient-to-br from-violet-500/25 via-purple-500/20 to-fuchsia-500/25 shadow-[0_22px_60px_-32px_rgba(217,70,239,1)]'
                            : 'border-white/12 bg-white/[0.06] hover:-translate-y-1 hover:border-white/25 hover:bg-white/10'
                        }`}
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <span className="text-fuchsia-100">{ICONS[m.value]}</span>
                          {active && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 text-white">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <h3 className="mb-1 text-[16px] font-semibold tracking-[-0.02em] text-white">
                          {m.title}
                        </h3>
                        <p className="mb-4 text-[13px] leading-5 text-violet-100/62">{m.desc}</p>
                        <ul className="space-y-1.5">
                          {m.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-[12px] text-violet-100/68">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-fuchsia-300/80" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <label className="label-field" htmlFor="ws-name">
                  {mode === 'personal' ? t.newWorkspace.workspaceName : t.newWorkspace.teamName}
                </label>
                <input
                  id="ws-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === 'personal' ? 'My research' : "Prof. Lin's group"}
                  className="input-field"
                  autoFocus
                />
              </section>

              {error && <div className="alert-error">{error}</div>}

              <div className="flex items-center gap-2 pt-1">
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? t.common.creating : t.newWorkspace.create}
                </button>
                <Link href="/" className="btn-ghost">{t.common.cancel}</Link>
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
