'use client';

import { useLanguage } from '@/lib/i18n';

interface ModeBadgeProps {
  mode: string;
}

export function ModeBadge({ mode }: ModeBadgeProps) {
  const { t } = useLanguage();
  const label = mode === 'personal' ? t.modes.personal : t.modes.team;
  return (
    <span className="pill">
      <span className="pill-dot" />
      {label}
    </span>
  );
}

interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const { t } = useLanguage();
  const roleLabels: Record<string, string> = {
    self: t.roles.self,
    admin: t.roles.admin,
    advisor: t.roles.advisor,
    student: t.roles.student,
    global_admin: t.roles.globalAdmin,
  };

  return (
    <span className="pill border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
      {roleLabels[role] ?? role}
    </span>
  );
}
