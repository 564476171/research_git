'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { ModeBadge, RoleBadge } from '@/components/Badge';
import MembersManager from '@/components/MembersManager';
import ModelsManager from '@/components/ModelsManager';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';

interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  mode: string;
  role: string;
  created_at: string;
}

interface Project {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

type Tab = 'projects' | 'members' | 'models';

export default function WorkspacePage() {
  const params = useParams<{ wid: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>('projects');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [editingWorkspace, setEditingWorkspace] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageWorkspace = Boolean(
    workspace && (workspace.owner_id === user?.id || workspace.role === 'global_admin')
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'projects', label: t.workspace.tabs.projects },
    { id: 'members', label: t.workspace.tabs.members },
    { id: 'models', label: t.workspace.tabs.models },
  ];

  const loadProjects = async () => {
    try {
      const res = await api.get<Project[]>(`/api/workspaces/${params.wid}/projects`);
      setProjects(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  useEffect(() => {
    api
      .get<Workspace[]>('/api/workspaces')
      .then((res) => {
        const ws = res.data.find((w) => w.id === params.wid);
        setWorkspace(ws ?? null);
        setWorkspaceName(ws?.name ?? '');
      })
      .catch(() => {});
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.wid]);

  const saveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !workspaceName.trim()) return;
    setSavingWorkspace(true);
    setError(null);
    setWorkspaceNotice(null);
    try {
      const res = await api.patch<Workspace>(`/api/workspaces/${workspace.id}`, {
        name: workspaceName.trim(),
      });
      setWorkspace(res.data);
      setWorkspaceName(res.data.name);
      setEditingWorkspace(false);
      setWorkspaceNotice(t.workspace.workspaceSaved);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSavingWorkspace(false);
    }
  };

  const deleteWorkspace = async () => {
    if (!workspace || !window.confirm(`${t.workspace.deleteWorkspaceConfirm}\n\n${workspace.name}`)) return;
    setDeletingWorkspace(true);
    setError(null);
    try {
      await api.delete(`/api/workspaces/${workspace.id}`);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
      setDeletingWorkspace(false);
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await api.post(`/api/workspaces/${params.wid}/projects`, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      setShowForm(false);
      loadProjects();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {workspace && <ModeBadge mode={workspace.mode} />}
            {workspace && <RoleBadge role={workspace.role} />}
          </div>
          {canManageWorkspace && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingWorkspace((prev) => !prev);
                  setWorkspaceName(workspace?.name ?? '');
                  setWorkspaceNotice(null);
                }}
                className="btn-secondary"
              >
                {t.workspace.editWorkspace}
              </button>
              <button
                type="button"
                onClick={deleteWorkspace}
                disabled={deletingWorkspace}
                className="btn-ghost text-rose-100 hover:text-white"
              >
                {t.workspace.deleteWorkspace}
              </button>
            </div>
          )}
        </div>
        <h1 className="gradient-text truncate text-[36px] font-semibold leading-tight tracking-[-0.05em] sm:text-[52px]">
          {workspace?.name ?? '—'}
        </h1>
        {workspaceNotice && <div className="mt-4 text-[13px] font-semibold text-cyan-100/80">{workspaceNotice}</div>}
        {editingWorkspace && (
          <form onSubmit={saveWorkspace} className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="label-field" htmlFor="workspace-name">{t.workspace.workspaceName}</label>
              <input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={savingWorkspace || !workspaceName.trim()} className="btn-primary">
                {savingWorkspace ? t.common.saving : t.common.saveChanges}
              </button>
              <button type="button" onClick={() => setEditingWorkspace(false)} className="btn-ghost">
                {t.common.cancel}
              </button>
            </div>
          </form>
        )}
      </header>

      <nav className="mb-8 flex w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.07] p-1 backdrop-blur-xl sm:w-fit">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`h-10 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-all ${
              tab === item.id
                ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_12px_30px_-18px_rgba(217,70,239,1)]'
                : 'text-violet-100/65 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
            {item.id === 'projects' && projects.length > 0 && (
              <span className="ml-1.5 text-[12px] text-white/70">{projects.length}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <div className="alert-error mb-6">{error}</div>}

      {tab === 'projects' && (
        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-[13px] text-violet-100/62">
              {projects.length === 0
                ? t.workspace.firstProject
                : `${projects.length} ${t.workspace.projectCount}${t.common.languageShort === '中' ? '' : projects.length === 1 ? '' : 's'}`}
            </p>
            {!showForm && (
              <button onClick={() => setShowForm(true)} className="btn-secondary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t.workspace.newProject}
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={onCreate} className="surface mb-4 space-y-4 p-5">
              <div>
                <label className="label-field" htmlFor="proj-title">{t.workspace.title}</label>
                <input
                  id="proj-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.workspace.projectPlaceholder}
                  className="input-field"
                  autoFocus
                />
              </div>
              <div>
                <label className="label-field" htmlFor="proj-desc">{t.workspace.description}</label>
                <textarea
                  id="proj-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.workspace.descriptionPlaceholder}
                  rows={2}
                  className="textarea-field"
                />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? t.common.creating : t.common.create}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setTitle('');
                    setDescription('');
                  }}
                  className="btn-ghost"
                >
                  {t.common.cancel}
                </button>
              </div>
            </form>
          )}

          {projects.length > 0 && (
            <ul className="surface divide-y divide-white/10 overflow-hidden">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.id}`}
                    className="block px-5 py-4 transition-all hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">
                          {p.title}
                        </h3>
                        {p.description && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-violet-100/62">{p.description}</p>
                        )}
                        <p className="mt-2 text-[11px] text-violet-100/42">
                          {new Date(p.created_at).toLocaleDateString(t.common.languageShort === '中' ? 'zh-CN' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <svg className="mt-1 shrink-0 text-fuchsia-200/45" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'members' && workspace && (
        <MembersManager
          workspaceId={params.wid}
          currentRole={workspace.role}
          isTeam={workspace.mode === 'team'}
        />
      )}

      {tab === 'models' && workspace && (
        <ModelsManager workspaceId={params.wid} currentRole={workspace.role} />
      )}
    </AppShell>
  );
}
