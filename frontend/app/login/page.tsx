'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuth } from '@/lib/auth';
import { useGuestGuard } from '@/lib/guards';
import { LanguageToggle, useLanguage } from '@/lib/i18n';
import { ThemeToggle } from '@/lib/theme';
import Brand from '@/components/Brand';

export default function LoginPage() {
  useGuestGuard();
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-gradient min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--surface-border)', background: 'var(--header-bg)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1.15fr)_420px]">
        <section className="space-y-6">
          <p className="page-kicker">Research Git</p>
          <h1 className="gradient-text max-w-3xl text-[54px] leading-[0.92] sm:text-[68px]">
            {t.auth.loginHero}
          </h1>
          <p className="max-w-xl text-[17px] leading-8 text-[var(--text-muted)]">
            {t.auth.sceneTwoBody}
          </p>
          <div className="product-panel hidden p-6 lg:block">
            <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--product-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
              Draft memory
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--product-border)', background: 'var(--product-surface-elevated)' }}>
                <div className="mb-2 text-[13px] font-medium text-[var(--product-text)]">Advisor feedback preserved by version</div>
                <p className="text-[13px] leading-6 text-[var(--product-muted)]">Track every revision, compare branches, and ask AI about the trajectory instead of losing context in document copies.</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--product-border)', background: 'var(--product-surface-soft)' }}>
                <div className="text-[12px] font-medium text-[var(--product-text)]">Project AI</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--product-muted)]">Streaming answers across drafts, reviews, and forked lines of inquiry.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface p-6 sm:p-8">
          <div className="mb-8">
            <h2 className="gradient-text text-[36px] leading-none">{t.auth.loginTitle}</h2>
            <p className="mt-3 text-[14px] leading-7 text-[var(--text-muted)]">
              {t.auth.loginSubtitle}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label-field" htmlFor="email">{t.auth.email}</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="label-field" htmlFor="password">{t.auth.password}</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
              />
            </div>
            {error && <div className="alert-error">{error}</div>}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t.auth.signingIn : t.auth.signIn}
            </button>
          </form>
          <p className="mt-8 text-center text-[13px] text-[var(--text-faint)]">
            {t.auth.newToResearchGit}{' '}
            <Link href="/register" className="font-medium text-[var(--accent-primary)] hover:text-[var(--accent-primary-active)]">
              {t.auth.createAccount}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
