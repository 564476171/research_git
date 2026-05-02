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
    <div className="snap-page">
      <div className="gradient-orb -left-20 top-16 h-80 w-80 bg-violet-500/35" />
      <div className="gradient-orb right-0 top-28 h-96 w-96 bg-fuchsia-500/25" />
      <div className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
        <span className="scroll-dot scroll-dot-active" />
        <span className="scroll-dot" />
      </div>
      <header className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5">
        <Brand size="md" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>

      <section className="snap-section">
        <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
          <div className="hidden lg:block">
            <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.28em] text-fuchsia-200/70">
              Research Git
            </p>
            <h2 className="max-w-xl text-[48px] font-semibold leading-[0.98] tracking-[-0.055em] text-white xl:text-[60px]">
              {t.auth.loginHero}
            </h2>
            <p className="mt-6 max-w-lg text-[15px] leading-7 text-violet-100/68">
              {t.auth.sceneTwoBody}
            </p>
          </div>

          <div className="glass-panel w-full p-6 sm:p-8">
            <div className="mb-8">
              <h1 className="gradient-text text-[30px] font-semibold tracking-[-0.04em]">
                {t.auth.loginTitle}
              </h1>
              <p className="mt-2 text-[14px] leading-6 text-violet-100/65">
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
            <p className="mt-8 text-center text-[13px] text-violet-100/60">
              {t.auth.newToResearchGit}{' '}
              <Link href="/register" className="font-semibold text-white hover:text-fuchsia-100">
                {t.auth.createAccount}
              </Link>
            </p>
          </div>
        </div>
        <div className="scroll-cue">
          <span>{t.auth.scroll}</span>
          <span className="h-7 w-px rounded-full bg-gradient-to-b from-violet-200/80 to-transparent" />
        </div>
      </section>

      <section className="snap-section">
        <div className="glass-panel max-w-3xl p-8 text-center sm:p-12">
          <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.28em] text-fuchsia-200/70">
            {t.auth.sceneTwoKicker}
          </p>
          <h2 className="gradient-text text-[34px] font-semibold tracking-[-0.045em] sm:text-[52px]">
            {t.auth.sceneTwoTitle}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-violet-100/70">
            {t.auth.sceneTwoBody}
          </p>
        </div>
      </section>
    </div>
  );
}
