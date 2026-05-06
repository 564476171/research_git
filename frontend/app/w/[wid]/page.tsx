'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { ModeBadge, RoleBadge } from '@/components/Badge';
import MembersManager from '@/components/MembersManager';
import ModelsManager from '@/components/ModelsManager';
import ConfirmDialog from '@/components/ConfirmDialog';
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

type ConfirmState =
  | { kind: 'delete-workspace'; workspaceId: string; workspaceName: string }
  | { kind: 'delete-project'; projectId: string; projectTitle: string }
  | null;

type OpenMenu =
  | { kind: 'workspace' }
  | { kind: 'project'; projectId: string }
  | null;

function MoreActionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

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
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectTitleDraft, setProjectTitleDraft] = useState('');
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const canManageWorkspace = Boolean(
    workspace && user && (
      workspace.owner_id === user.id ||
      workspace.role === 'self' ||
      workspace.role === 'admin' ||
      user.is_global_admin
    )
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'projects', label: t.workspace.tabs.projects },
    { id: 'members', label: t.workspace.tabs.members },
    { id: 'models', label: t.workspace.tabs.models },
  ];

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (openMenuRef.current && !openMenuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openMenu]);

  const attachOpenMenuRef = (node: HTMLDivElement | null) => {
    if (node) openMenuRef.current = node;
  };

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

  const openWorkspaceEditor = () => {
    setEditingWorkspace(true);
    setWorkspaceName(workspace?.name ?? '');
    setWorkspaceNotice(null);
    setOpenMenu(null);
  };

  const cancelWorkspaceEditor = () => {
    setEditingWorkspace(false);
    setWorkspaceName(workspace?.name ?? '');
  };

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
    if (!workspace) return;
    setDeletingWorkspace(true);
    setError(null);
    try {
      await api.delete(`/api/workspaces/${workspace.id}`);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
      setDeletingWorkspace(false);
    } finally {
      setConfirmState((current) => (current?.kind === 'delete-workspace' ? null : current));
    }
  };

  const startProjectRename = (project: Project) => {
    setEditingProjectId(project.id);
    setProjectTitleDraft(project.title);
    setOpenMenu(null);
    setError(null);
  };

  const cancelProjectRename = () => {
    setEditingProjectId(null);
    setProjectTitleDraft('');
  };

  const saveProjectTitle = async (e: React.FormEvent, project: Project) => {
    e.preventDefault();
    if (!projectTitleDraft.trim()) return;

    setSavingProjectId(project.id);
    setError(null);
    try {
      const res = await api.patch<Project>(`/api/projects/${project.id}`, {
        title: projectTitleDraft.trim(),
      });
      setProjects((current) => current.map((item) => (item.id === project.id ? res.data : item)));
      setEditingProjectId(null);
      setProjectTitleDraft('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSavingProjectId((current) => (current === project.id ? null : current));
    }
  };

  const deleteProject = async (project: Project) => {
    setDeletingProjectId(project.id);
    setError(null);
    try {
      await api.delete(`/api/projects/${project.id}`);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (editingProjectId === project.id) {
        setEditingProjectId(null);
        setProjectTitleDraft('');
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setDeletingProjectId((current) => (current === project.id ? null : current));
      setConfirmState((current) => (current?.kind === 'delete-project' && current.projectId === project.id ? null : current));
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

  const menuItemClass = 'flex h-10 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]';
  const menuDangerClass = 'flex h-10 w-full items-center rounded-xl px-3 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--error-soft)] hover:text-[var(--error)]';

  return (
    <AppShell>
      <header className="surface mb-8 overflow-hidden p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {workspace && <ModeBadge mode={workspace.mode} />}
            {workspace && <RoleBadge role={workspace.role} />}
          </div>
          {canManageWorkspace && (
            <div ref={openMenu?.kind === 'workspace' ? attachOpenMenuRef : undefined} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((current) => (current?.kind === 'workspace' ? null : { kind: 'workspace' }))}
                className="chrome-button h-9 w-9 justify-center px-0"
                aria-label={t.common.moreActions}
                title={t.common.moreActions}
              >
                <MoreActionsIcon />
              </button>
              {openMenu?.kind === 'workspace' && (
                <div className="menu-panel absolute right-0 top-full z-20 mt-2 w-56">
                  <button type="button" onClick={openWorkspaceEditor} className={menuItemClass}>
                    {t.workspace.editWorkspace}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!workspace) return;
                      setConfirmState({ kind: 'delete-workspace', workspaceId: workspace.id, workspaceName: workspace.name });
                      setOpenMenu(null);
                    }}
                    className={menuDangerClass}
                  >
                    {t.workspace.deleteWorkspace}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <h1 className="gradient-text text-[40px] leading-[0.94] sm:text-[56px]">
          {workspace?.name ?? '—'}
        </h1>
        {workspaceNotice && <div className="mt-4 text-[13px] font-medium text-[var(--accent-primary)]">{workspaceNotice}</div>}
        {editingWorkspace && (
          <form onSubmit={saveWorkspace} className="surface mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
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
              <button type="button" onClick={cancelWorkspaceEditor} className="btn-ghost">
                {t.common.cancel}
              </button>
            </div>
          </form>
        )}
      </header>

      <nav className="mb-8 flex w-full gap-1 overflow-x-auto rounded-full border p-1 sm:w-fit" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-bg)' }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`h-10 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-all ${
              tab === item.id
                ? 'bg-[var(--text-primary)] text-[var(--canvas)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--canvas)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
            {item.id === 'projects' && projects.length > 0 && (
              <span className="ml-1.5 text-[12px] opacity-70">{projects.length}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <div className="alert-error mb-6">{error}</div>}

      {tab === 'projects' && (
        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-[13px] text-[var(--text-muted)]">
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
            <ul className="surface divide-y overflow-visible" style={{ borderColor: 'var(--surface-border)' }}>
              {projects.map((project) => {
                const canManageProject = Boolean(user && (project.owner_id === user.id || canManageWorkspace || user.is_global_admin));
                const projectMenuOpen = openMenu?.kind === 'project' && openMenu.projectId === project.id;
                const editingProject = editingProjectId === project.id;
                return (
                  <li key={project.id} className={`relative flex items-start justify-between gap-3 px-5 py-4 transition-all hover:bg-[var(--surface-bg-strong)] ${projectMenuOpen ? 'z-20' : ''}`}>
                    {editingProject ? (
                      <form onSubmit={(e) => saveProjectTitle(e, project)} className="min-w-0 flex-1 space-y-3 pr-2">
                        <div className="min-w-0">
                          <input
                            value={projectTitleDraft}
                            onChange={(e) => setProjectTitleDraft(e.target.value)}
                            className="input-field h-10"
                            autoFocus
                          />
                          {project.description && (
                            <p className="mt-2 line-clamp-2 text-[13px] text-[var(--text-muted)]">{project.description}</p>
                          )}
                          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                            {new Date(project.created_at).toLocaleDateString(t.common.languageShort === '中' ? 'zh-CN' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="submit" disabled={savingProjectId === project.id || !projectTitleDraft.trim()} className="btn-primary h-9 px-3 text-[12px]">
                            {savingProjectId === project.id ? t.common.saving : t.common.saveChanges}
                          </button>
                          <button type="button" onClick={cancelProjectRename} className="btn-ghost h-9 px-2.5 text-[12px]">
                            {t.common.cancel}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <Link href={`/p/${project.id}`} className="min-w-0 flex-1">
                        <div className="min-w-0">
                          <h3 className="truncate text-[16px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">
                            {project.title}
                          </h3>
                          {project.description && (
                            <p className="mt-1 line-clamp-2 text-[13px] text-[var(--text-muted)]">{project.description}</p>
                          )}
                          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                            {new Date(project.created_at).toLocaleDateString(t.common.languageShort === '中' ? 'zh-CN' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </Link>
                    )}
                    {!editingProject && (
                      <div ref={projectMenuOpen ? attachOpenMenuRef : undefined} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setOpenMenu((current) => (current?.kind === 'project' && current.projectId === project.id ? null : { kind: 'project', projectId: project.id }))}
                          className="chrome-button h-9 w-9 justify-center px-0"
                          aria-label={t.common.moreActions}
                          title={t.common.moreActions}
                        >
                          <MoreActionsIcon />
                        </button>
                        {projectMenuOpen && (
                          <div className="menu-panel absolute right-0 top-full z-20 mt-2 w-56">
                            <Link
                              href={`/p/${project.id}`}
                              onClick={() => setOpenMenu(null)}
                              className={menuItemClass}
                            >
                              {t.common.open}
                            </Link>
                            {canManageProject && (
                              <button type="button" onClick={() => startProjectRename(project)} className={menuItemClass}>
                                {t.common.rename}
                              </button>
                            )}
                            {canManageProject && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmState({ kind: 'delete-project', projectId: project.id, projectTitle: project.title });
                                  setOpenMenu(null);
                                }}
                                disabled={deletingProjectId === project.id}
                                className={menuDangerClass}
                              >
                                {t.project.deleteProject}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
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
      {confirmState && (
        <ConfirmDialog
          open
          title={confirmState.kind === 'delete-workspace' ? t.workspace.deleteWorkspace : t.project.deleteProject}
          message={confirmState.kind === 'delete-workspace' ? t.workspace.deleteWorkspaceConfirm : t.project.deleteProjectConfirm}
          detail={confirmState.kind === 'delete-workspace' ? confirmState.workspaceName : confirmState.projectTitle}
          confirmLabel={t.common.delete}
          busy={confirmState.kind === 'delete-workspace' ? deletingWorkspace : deletingProjectId === confirmState.projectId}
          onClose={() => setConfirmState(null)}
          onConfirm={() => {
            if (confirmState.kind === 'delete-workspace') {
              void deleteWorkspace();
              return;
            }
            const project = projects.find((item) => item.id === confirmState.projectId);
            if (project) void deleteProject(project);
          }}
        />
      )}
    </AppShell>
  );
}
