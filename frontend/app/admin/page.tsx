'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';

import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import { ModeBadge } from '@/components/Badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';

type RegistrationMode = 'open' | 'invite_code' | 'closed';

interface AdminStats {
  users: number;
  global_admins: number;
  workspaces: number;
  projects: number;
}

interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  institution: string | null;
  is_global_admin: boolean;
  created_at: string;
  workspace_count: number;
  project_count: number;
}

interface AdminWorkspace {
  id: string;
  name: string;
  mode: string;
  owner_id: string;
  owner_email: string;
  owner_display_name: string | null;
  member_count: number;
  project_count: number;
  created_at: string;
}

interface AdminInviteCode {
  id: string;
  active: boolean;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  created_by_id: string | null;
}

interface AdminPlatformSettings {
  frontend_url: string;
}

interface AdminRegistrationSettings {
  registration_mode: RegistrationMode;
  invite_codes: AdminInviteCode[];
}

function formatDate(value: string, isZh: boolean) {
  return new Date(value).toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AdminSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <section className="surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-col gap-3 px-5 py-5 text-left transition-all hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
      >
        <span>
          <span className="block text-[18px] font-semibold tracking-[-0.03em] text-white">{title}</span>
          <span className="mt-1 block text-[13px] text-violet-100/55">{description}</span>
        </span>
        <span className="btn-ghost self-start sm:self-auto">{open ? t.common.collapse : t.common.expand}</span>
      </button>
      {open && <div className="border-t border-white/10">{children}</div>}
    </section>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [platformSettings, setPlatformSettings] = useState<AdminPlatformSettings | null>(null);
  const [frontendUrl, setFrontendUrl] = useState('');
  const [registration, setRegistration] = useState<AdminRegistrationSettings | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    email: '',
    display_name: '',
    institution: '',
    avatar_url: '',
    is_global_admin: false,
  });
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceForm, setWorkspaceForm] = useState({ name: '' });
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({ deployment: true, registration: false, users: false, workspaces: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const isZh = t.common.languageShort === '中';

  const loadStats = async () => {
    const res = await api.get<AdminStats>('/api/admin/stats');
    setStats(res.data);
  };

  const loadPlatformSettings = async () => {
    const res = await api.get<AdminPlatformSettings>('/api/admin/platform-settings');
    setPlatformSettings(res.data);
    setFrontendUrl(res.data.frontend_url);
  };

  const loadRegistration = async () => {
    const res = await api.get<AdminRegistrationSettings>('/api/admin/registration');
    setRegistration(res.data);
  };

  const loadUsers = async (q = userQuery) => {
    const res = await api.get<AdminUser[]>('/api/admin/users', { params: { q: q || undefined } });
    setUsers(res.data);
  };

  const loadWorkspaces = async (q = workspaceQuery) => {
    const res = await api.get<AdminWorkspace[]>('/api/admin/workspaces', { params: { q: q || undefined } });
    setWorkspaces(res.data);
  };

  useEffect(() => {
    if (!user?.is_global_admin) {
      setLoading(false);
      return;
    }
    Promise.all([loadStats(), loadPlatformSettings(), loadRegistration(), loadUsers(''), loadWorkspaces('')])
      .catch((e: any) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_global_admin]);

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const savePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlatform(true);
    setError(null);
    try {
      const res = await api.patch<AdminPlatformSettings>('/api/admin/platform-settings', {
        frontend_url: frontendUrl,
      });
      setPlatformSettings(res.data);
      setFrontendUrl(res.data.frontend_url);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setSavingPlatform(false);
    }
  };

  const updateRegistrationMode = async (mode: RegistrationMode) => {
    setSavingRegistration(true);
    setError(null);
    try {
      const res = await api.patch<AdminRegistrationSettings>('/api/admin/registration', {
        registration_mode: mode,
      });
      setRegistration(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setSavingRegistration(false);
    }
  };

  const createInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    setGeneratedCode(null);
    setError(null);
    try {
      const res = await api.post<AdminInviteCode & { code: string }>('/api/admin/invite-codes', {
        max_uses: Number(inviteMaxUses) || 1,
        expires_at: inviteExpiresAt || null,
      });
      setGeneratedCode(res.data.code);
      setRegistration((prev) => prev ? { ...prev, invite_codes: [res.data, ...prev.invite_codes] } : prev);
      setInviteMaxUses('1');
      setInviteExpiresAt('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const toggleInviteCode = async (inviteCode: AdminInviteCode) => {
    setError(null);
    try {
      const res = await api.patch<AdminInviteCode>(`/api/admin/invite-codes/${inviteCode.id}`, {
        active: !inviteCode.active,
      });
      setRegistration((prev) => prev ? {
        ...prev,
        invite_codes: prev.invite_codes.map((item) => (item.id === inviteCode.id ? res.data : item)),
      } : prev);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const toggleAdmin = async (target: AdminUser) => {
    try {
      const res = await api.patch<AdminUser>(`/api/admin/users/${target.id}`, {
        is_global_admin: !target.is_global_admin,
      });
      setUsers((prev) => prev.map((u) => (u.id === target.id ? res.data : u)));
      await loadStats();
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const startEditUser = (target: AdminUser) => {
    setEditingUserId(target.id);
    setUserForm({
      email: target.email,
      display_name: target.display_name ?? '',
      institution: target.institution ?? '',
      avatar_url: target.avatar_url ?? '',
      is_global_admin: target.is_global_admin,
    });
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setSavingUser(true);
    setError(null);
    try {
      const res = await api.patch<AdminUser>(`/api/admin/users/${editingUserId}`, {
        email: userForm.email,
        display_name: userForm.display_name || null,
        institution: userForm.institution || null,
        avatar_url: userForm.avatar_url || null,
        is_global_admin: userForm.is_global_admin,
      });
      setUsers((prev) => prev.map((item) => (item.id === editingUserId ? res.data : item)));
      setEditingUserId(null);
      await loadStats();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async (target: AdminUser) => {
    if (!window.confirm(`${t.admin.deleteUserConfirm}\n\n${target.email}`)) return;
    setDeletingUserId(target.id);
    setError(null);
    try {
      await api.delete(`/api/admin/users/${target.id}`);
      setUsers((prev) => prev.filter((item) => item.id !== target.id));
      await loadStats();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const startEditWorkspace = (workspace: AdminWorkspace) => {
    setEditingWorkspaceId(workspace.id);
    setWorkspaceForm({ name: workspace.name });
  };

  const saveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkspaceId) return;
    setSavingWorkspace(true);
    setError(null);
    try {
      const res = await api.patch<AdminWorkspace>(`/api/admin/workspaces/${editingWorkspaceId}`, {
        name: workspaceForm.name,
      });
      setWorkspaces((prev) => prev.map((item) => (item.id === editingWorkspaceId ? res.data : item)));
      setEditingWorkspaceId(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setSavingWorkspace(false);
    }
  };

  const deleteWorkspace = async (workspace: AdminWorkspace) => {
    if (!window.confirm(`${t.admin.deleteWorkspaceConfirm}\n\n${workspace.name}`)) return;
    setDeletingWorkspaceId(workspace.id);
    setError(null);
    try {
      await api.delete(`/api/admin/workspaces/${workspace.id}`);
      setWorkspaces((prev) => prev.filter((item) => item.id !== workspace.id));
      await loadStats();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const modeOptions: Array<[RegistrationMode, string]> = [
    ['open', t.admin.openRegistration],
    ['invite_code', t.admin.inviteOnlyRegistration],
    ['closed', t.admin.closedRegistration],
  ];

  if (!user?.is_global_admin && !loading) {
    return (
      <AppShell>
        <div className="surface mx-auto max-w-xl px-6 py-12 text-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-white">{t.admin.title}</h1>
          <p className="mt-3 text-[14px] leading-6 text-violet-100/62">{t.admin.forbidden}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            {t.roles.globalAdmin}
          </div>
          <h1 className="gradient-text text-[36px] font-semibold leading-tight tracking-[-0.05em] sm:text-[52px]">
            {t.admin.title}
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-violet-100/65">{t.admin.subtitle}</p>
        </header>

        {error && <div className="alert-error">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t.admin.users, stats?.users ?? '—'],
            [t.admin.globalAdmins, stats?.global_admins ?? '—'],
            [t.admin.workspaces, stats?.workspaces ?? '—'],
            [t.admin.projects, stats?.projects ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="surface p-5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-100/50">{label}</div>
              <div className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-white">{value}</div>
            </div>
          ))}
        </section>

        <div className="space-y-4">
          <AdminSection
            title={t.admin.deployment}
            description={t.admin.deploymentHelp}
            open={openSections.deployment}
            onToggle={() => toggleSection('deployment')}
          >
            <form onSubmit={savePlatformSettings} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label className="label-field" htmlFor="admin-frontend-url">{t.admin.frontendUrl}</label>
                <input
                  id="admin-frontend-url"
                  name="admin-frontend-url"
                  type="url"
                  value={frontendUrl}
                  onChange={(e) => setFrontendUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="input-field"
                  required
                />
                {platformSettings && (
                  <p className="themed-faint mt-2 text-[12px]">
                    {t.common.updated}: {platformSettings.frontend_url}
                  </p>
                )}
              </div>
              <button type="submit" disabled={savingPlatform || !frontendUrl.trim()} className="btn-primary justify-center">
                {savingPlatform ? t.common.saving : t.admin.saveDeployment}
              </button>
            </form>
          </AdminSection>

          <AdminSection
            title={t.admin.registration}
            description={t.admin.registrationHelp}
            open={openSections.registration}
            onToggle={() => toggleSection('registration')}
          >
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div>
                  <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-white">{t.admin.registrationMode}</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {modeOptions.map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateRegistrationMode(mode)}
                        disabled={savingRegistration || registration?.registration_mode === mode}
                        className={registration?.registration_mode === mode ? 'btn-primary justify-center' : 'btn-secondary justify-center'}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {generatedCode && (
                  <div className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/10 p-4">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-100/75">{t.admin.generatedInviteCode}</div>
                    <div className="mt-2 break-all font-mono text-[14px] text-white">{generatedCode}</div>
                  </div>
                )}

                <div>
                  <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-white">{t.admin.inviteCodes}</h3>
                  {registration?.invite_codes.length ? (
                    <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-[1.25rem] border border-white/10">
                      {registration.invite_codes.map((inviteCode) => (
                        <li key={inviteCode.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={inviteCode.active ? 'pill' : 'pill-dark'}>
                                {inviteCode.active ? t.admin.active : t.admin.inactive}
                              </span>
                              <span className="text-[12px] text-violet-100/55">
                                {t.admin.usedCount}: {inviteCode.use_count}/{inviteCode.max_uses}
                              </span>
                            </div>
                            <div className="mt-2 text-[12px] text-violet-100/50">
                              {t.admin.expiresAt}: {inviteCode.expires_at ? formatDate(inviteCode.expires_at, isZh) : t.admin.neverExpires}
                            </div>
                            <div className="mt-1 text-[11px] text-violet-100/38">
                              {formatDate(inviteCode.created_at, isZh)}
                            </div>
                          </div>
                          <button type="button" onClick={() => toggleInviteCode(inviteCode)} className="btn-secondary self-start sm:self-auto">
                            {inviteCode.active ? t.admin.disable : t.admin.enable}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[13px] text-violet-100/52">{t.common.noneYet}</p>
                  )}
                </div>
              </div>

              <form onSubmit={createInviteCode} className="h-fit rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-white">{t.admin.createInviteCode}</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="label-field" htmlFor="invite-max-uses">{t.admin.maxUses}</label>
                    <input
                      id="invite-max-uses"
                      type="number"
                      min={1}
                      max={10000}
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label-field" htmlFor="invite-expires-at">{t.admin.expiresAt}</label>
                    <input
                      id="invite-expires-at"
                      type="datetime-local"
                      value={inviteExpiresAt}
                      onChange={(e) => setInviteExpiresAt(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <button type="submit" disabled={creatingInvite} className="btn-primary w-full justify-center">
                    {creatingInvite ? t.common.creating : t.admin.createInviteCode}
                  </button>
                </div>
              </form>
            </div>
          </AdminSection>

          <AdminSection
            title={t.admin.users}
            description={t.admin.searchUsers}
            open={openSections.users}
            onToggle={() => toggleSection('users')}
          >
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[13px] text-violet-100/55">{t.admin.searchUsers}</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadUsers().catch((err: any) => setError(err?.response?.data?.detail || err.message));
                }}
                className="flex gap-2"
              >
                <input
                  id="admin-user-search"
                  name="admin-user-search"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder={t.common.search}
                  className="input-field h-10 w-56"
                />
                <button className="btn-secondary" type="submit">{t.common.search}</button>
              </form>
            </div>
            {users.length > 0 ? (
              <ul className="divide-y divide-white/10">
                {users.map((item) => (
                  <li key={item.id} className="px-5 py-4 transition-all hover:bg-white/10">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar src={item.avatar_url} name={item.display_name} email={item.email} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-white">{item.display_name || item.email}</span>
                            {item.is_global_admin && <span className="pill-dark">{t.roles.globalAdmin}</span>}
                          </div>
                          <div className="truncate text-[12px] text-violet-100/55">{item.email}</div>
                          <div className="mt-1 text-[11px] text-violet-100/42">
                            {item.workspace_count} {t.admin.workspaces} · {item.project_count} {t.admin.projects} · {formatDate(item.created_at, isZh)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => startEditUser(item)} className="btn-secondary">
                          {t.admin.editUser}
                        </button>
                        <button type="button" onClick={() => toggleAdmin(item)} className={item.is_global_admin ? 'btn-ghost' : 'btn-secondary'}>
                          {item.is_global_admin ? t.admin.demote : t.admin.promote}
                        </button>
                        {item.id !== user?.id && (
                          <button
                            type="button"
                            onClick={() => deleteUser(item)}
                            disabled={deletingUserId === item.id}
                            className="btn-ghost text-rose-100 hover:text-white"
                          >
                            {t.admin.deleteUser}
                          </button>
                        )}
                      </div>
                    </div>
                    {editingUserId === item.id && (
                      <form onSubmit={saveUser} className="mt-4 grid gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-2">
                        <div>
                          <label className="label-field" htmlFor={`admin-user-email-${item.id}`}>{t.admin.email}</label>
                          <input
                            id={`admin-user-email-${item.id}`}
                            type="email"
                            value={userForm.email}
                            onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
                            className="input-field"
                            required
                          />
                        </div>
                        <div>
                          <label className="label-field" htmlFor={`admin-user-name-${item.id}`}>{t.admin.displayName}</label>
                          <input
                            id={`admin-user-name-${item.id}`}
                            value={userForm.display_name}
                            onChange={(e) => setUserForm((prev) => ({ ...prev, display_name: e.target.value }))}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="label-field" htmlFor={`admin-user-institution-${item.id}`}>{t.admin.institution}</label>
                          <input
                            id={`admin-user-institution-${item.id}`}
                            value={userForm.institution}
                            onChange={(e) => setUserForm((prev) => ({ ...prev, institution: e.target.value }))}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="label-field" htmlFor={`admin-user-avatar-${item.id}`}>{t.admin.avatarUrl}</label>
                          <input
                            id={`admin-user-avatar-${item.id}`}
                            value={userForm.avatar_url}
                            onChange={(e) => setUserForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                            className="input-field"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-[13px] font-semibold text-violet-100/75">
                          <input
                            type="checkbox"
                            checked={userForm.is_global_admin}
                            onChange={(e) => setUserForm((prev) => ({ ...prev, is_global_admin: e.target.checked }))}
                          />
                          {t.roles.globalAdmin}
                        </label>
                        <div className="flex items-center gap-2 lg:justify-end">
                          <button type="submit" disabled={savingUser || !userForm.email.trim()} className="btn-primary">
                            {savingUser ? t.common.saving : t.admin.saveUser}
                          </button>
                          <button type="button" onClick={() => setEditingUserId(null)} className="btn-ghost">
                            {t.common.cancel}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-[13px] text-violet-100/52">{t.admin.noUsers}</p>
            )}
          </AdminSection>

          <AdminSection
            title={t.admin.workspaces}
            description={t.admin.searchWorkspaces}
            open={openSections.workspaces}
            onToggle={() => toggleSection('workspaces')}
          >
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[13px] text-violet-100/55">{t.admin.searchWorkspaces}</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadWorkspaces().catch((err: any) => setError(err?.response?.data?.detail || err.message));
                }}
                className="flex gap-2"
              >
                <input
                  id="admin-workspace-search"
                  name="admin-workspace-search"
                  value={workspaceQuery}
                  onChange={(e) => setWorkspaceQuery(e.target.value)}
                  placeholder={t.common.search}
                  className="input-field h-10 w-56"
                />
                <button className="btn-secondary" type="submit">{t.common.search}</button>
              </form>
            </div>
            {workspaces.length > 0 ? (
              <ul className="divide-y divide-white/10">
                {workspaces.map((workspace) => (
                  <li key={workspace.id} className="px-5 py-4 transition-all hover:bg-white/10">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-white">{workspace.name}</span>
                          <ModeBadge mode={workspace.mode} />
                        </div>
                        <div className="mt-1 truncate text-[12px] text-violet-100/55">
                          {t.admin.owner}: {workspace.owner_display_name || workspace.owner_email}
                        </div>
                        <div className="mt-1 text-[11px] text-violet-100/42">
                          {workspace.member_count} {t.admin.members} · {workspace.project_count} {t.admin.projects} · {formatDate(workspace.created_at, isZh)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/w/${workspace.id}`} className="btn-secondary self-start sm:self-auto">
                          {t.common.open}
                        </Link>
                        <button type="button" onClick={() => startEditWorkspace(workspace)} className="btn-secondary">
                          {t.admin.editWorkspace}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteWorkspace(workspace)}
                          disabled={deletingWorkspaceId === workspace.id}
                          className="btn-ghost text-rose-100 hover:text-white"
                        >
                          {t.admin.deleteWorkspace}
                        </button>
                      </div>
                    </div>
                    {editingWorkspaceId === workspace.id && (
                      <form onSubmit={saveWorkspace} className="mt-4 flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <label className="label-field" htmlFor={`admin-workspace-name-${workspace.id}`}>{t.workspace.workspaceName}</label>
                          <input
                            id={`admin-workspace-name-${workspace.id}`}
                            value={workspaceForm.name}
                            onChange={(e) => setWorkspaceForm({ name: e.target.value })}
                            className="input-field"
                            required
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={savingWorkspace || !workspaceForm.name.trim()} className="btn-primary">
                            {savingWorkspace ? t.common.saving : t.admin.saveWorkspace}
                          </button>
                          <button type="button" onClick={() => setEditingWorkspaceId(null)} className="btn-ghost">
                            {t.common.cancel}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-[13px] text-violet-100/52">{t.admin.noWorkspaces}</p>
            )}
          </AdminSection>
        </div>
      </div>
    </AppShell>
  );
}
