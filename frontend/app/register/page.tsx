'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGuestGuard } from '@/lib/guards';
import { LanguageToggle, useLanguage } from '@/lib/i18n';
import { ThemeToggle } from '@/lib/theme';
import Brand from '@/components/Brand';

type RegistrationMode = 'open' | 'invite_code' | 'closed';

export default function RegisterPage() {
  useGuestGuard();
  const router = useRouter();
  const { register } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('open');
  const [policyLoading, setPolicyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ registration_mode: RegistrationMode }>('/api/auth/registration-policy')
      .then((res) => setRegistrationMode(res.data.registration_mode))
      .catch(() => setRegistrationMode('open'))
      .finally(() => setPolicyLoading(false));
  }, []);

  const registrationClosed = registrationMode === 'closed';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(
        email,
        password,
        displayName || undefined,
        registrationMode === 'invite_code' ? inviteCode : undefined
      );
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

      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1.15fr)_430px]">
        <section className="space-y-6">
          <p className="page-kicker">Research Git</p>
          <h1 className="gradient-text max-w-3xl text-[54px] leading-[0.92] sm:text-[68px]">
            {t.auth.registerHero}
          </h1>
          <p className="max-w-xl text-[17px] leading-8 text-[var(--text-muted)]">
            {t.auth.sceneTwoBody}
          </p>
          <div className="product-panel hidden p-6 lg:block">
            <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--product-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-teal)]" />
              Workspace setup
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--product-border)', background: 'var(--product-surface-elevated)' }}>
                <div className="mb-2 text-[13px] font-medium text-[var(--product-text)]">Personal workspace first</div>
                <p className="text-[13px] leading-6 text-[var(--product-muted)]">Start solo, then add team workspaces for advisor–student collaboration when you need shared reviews and models.</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--product-border)', background: 'var(--product-surface-soft)' }}>
                <div className="text-[12px] font-medium text-[var(--product-text)]">Invite-aware registration</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--product-muted)]">Open, invite-only, or closed registration is handled centrally by your platform admin.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface p-6 sm:p-8">
          <div className="mb-8">
            <h2 className="gradient-text text-[36px] leading-none">{t.auth.registerTitle}</h2>
            <p className="mt-3 text-[14px] leading-7 text-[var(--text-muted)]">
              {t.auth.registerSubtitle}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-5">
            {registrationMode === 'invite_code' && (
              <div className="rounded-2xl border px-4 py-3 text-[13px] leading-6" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-bg-strong)', color: 'var(--text-secondary)' }}>
                {t.auth.registrationInviteRequired}
              </div>
            )}
            {registrationClosed && (
              <div className="alert-error">{t.auth.registrationClosed}</div>
            )}
            <div>
              <label className="label-field" htmlFor="name">{t.auth.displayName}</label>
              <input
                id="name"
                type="text"
                placeholder={t.auth.optional}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field"
                autoFocus
              />
            </div>
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
              />
            </div>
            <div>
              <label className="label-field" htmlFor="password">{t.auth.password}</label>
              <input
                id="password"
                type="password"
                placeholder={t.auth.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="input-field"
              />
            </div>
            {registrationMode === 'invite_code' && (
              <div>
                <label className="label-field" htmlFor="invite-code">{t.auth.inviteCode}</label>
                <input
                  id="invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
            )}
            {error && <div className="alert-error">{error}</div>}
            <button type="submit" disabled={submitting || policyLoading || registrationClosed} className="btn-primary w-full">
              {submitting ? t.auth.creatingAccount : t.auth.createAccount}
            </button>
          </form>
          <p className="mt-8 text-center text-[13px] text-[var(--text-faint)]">
            {t.auth.alreadyHaveAccount}{' '}
            <Link href="/login" className="font-medium text-[var(--accent-primary)] hover:text-[var(--accent-primary-active)]">
              {t.auth.signIn}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
