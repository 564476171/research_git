'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { api, authFetch } from '@/lib/api';
import type { ModelConfig } from '@/components/ModelsManager';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

interface Project {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string;
  description: string | null;
}

interface WorkspaceAccess {
  id: string;
  owner_id: string;
  role: string;
}

interface Commit {
  id: string;
  project_id?: string;
  parent_id: string | null;
  branch_id: string | null;
  author_id: string;
  message: string | null;
  llm_summary: string | null;
  status: 'pending' | 'ready' | 'failed';
  created_at: string;
}

interface CommitDetail extends Commit {
  content: string;
  project_id: string;
}

interface Branch {
  id: string;
  project_id: string;
  name: string;
  head_commit_id: string | null;
  created_from_commit_id: string | null;
  created_by_id: string;
  is_default: boolean;
  created_at: string;
}

interface GraphCommit {
  id: string;
  parent_id: string | null;
  branch_id: string | null;
  message: string | null;
  created_at: string;
  is_head: boolean;
}

interface ProjectGraph {
  branches: Branch[];
  commits: GraphCommit[];
}

interface AiOutput {
  id: string;
  project_id: string;
  commit_id: string;
  user_id: string;
  kind: 'diff_summary' | 'cumulative_summary';
  content: string;
  model_config_id: string | null;
  created_at: string;
}

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AiConversationResponse {
  id: string | null;
  project_id: string;
  user_id: string;
  messages: AiMessage[];
}

interface SimilarCommit {
  id: string;
  message: string | null;
  created_at: string;
  similarity: number;
}

interface Review {
  id: string;
  commit_id: string;
  reviewer_id: string;
  reviewer_display: string | null;
  content: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

type EditorMode = 'edit' | 'preview' | 'split';

type ConfirmState =
  | { kind: 'delete-commit'; commitId: string }
  | { kind: 'delete-branch'; branchId: string; branchName: string }
  | { kind: 'delete-project'; projectTitle: string }
  | { kind: 'clear-ai' }
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

function parseInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(
        <a key={key} href={match[2]} target="_blank" rel="noreferrer">
          {token.slice(1, token.indexOf(']'))}
        </a>
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function MarkdownPreview({ content, emptyText }: { content: string; emptyText: string }) {
  const blocks = useMemo(() => {
    const lines = content.split('\n');
    const parsed: ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (line.trim() === '---') {
        parsed.push(<hr key={`hr-${index}`} />);
        index += 1;
        continue;
      }

      if (line.startsWith('```')) {
        const code: string[] = [];
        index += 1;
        while (index < lines.length && !lines[index].startsWith('```')) {
          code.push(lines[index]);
          index += 1;
        }
        parsed.push(
          <pre key={`code-${index}`}>
            <code>{code.join('\n')}</code>
          </pre>
        );
        index += 1;
        continue;
      }

      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        const children = parseInlineMarkdown(heading[2], `h-${index}`);
        if (level === 1) parsed.push(<h1 key={`h-${index}`}>{children}</h1>);
        if (level === 2) parsed.push(<h2 key={`h-${index}`}>{children}</h2>);
        if (level === 3) parsed.push(<h3 key={`h-${index}`}>{children}</h3>);
        index += 1;
        continue;
      }

      if (line.startsWith('>')) {
        const quote: string[] = [];
        while (index < lines.length && lines[index].startsWith('>')) {
          quote.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }
        parsed.push(<blockquote key={`quote-${index}`}>{parseInlineMarkdown(quote.join(' '), `quote-${index}`)}</blockquote>);
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^[-*]\s+/, ''));
          index += 1;
        }
        parsed.push(
          <ul key={`ul-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{parseInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\d+\.\s+/, ''));
          index += 1;
        }
        parsed.push(
          <ol key={`ol-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{parseInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>
            ))}
          </ol>
        );
        continue;
      }

      const paragraph: string[] = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^(#{1,3})\s+/.test(lines[index]) &&
        !lines[index].startsWith('```') &&
        !lines[index].startsWith('>') &&
        !/^[-*]\s+/.test(lines[index]) &&
        !/^\d+\.\s+/.test(lines[index]) &&
        lines[index].trim() !== '---'
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      parsed.push(<p key={`p-${index}`}>{parseInlineMarkdown(paragraph.join(' '), `p-${index}`)}</p>);
    }

    return parsed;
  }, [content]);

  if (!content.trim()) {
    return <div className="markdown-preview markdown-preview-empty">{emptyText}</div>;
  }

  return <article className="markdown-preview">{blocks}</article>;
}

function EditorModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
        active ? 'editor-mode-active' : 'editor-mode-inactive'
      }`}
    >
      {children}
    </button>
  );
}

function localeFor(language: 'en' | 'zh') {
  return language === 'zh' ? 'zh-CN' : 'en-US';
}

function formatDate(value: string, language: 'en' | 'zh') {
  return new Date(value).toLocaleString(localeFor(language), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function temporaryAiMessage(role: AiMessage['role'], content: string): AiMessage {
  return {
    id: `tmp-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    created_at: new Date().toISOString(),
  };
}

export default function ProjectPage() {
  const params = useParams<{ pid: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [project, setProject] = useState<Project | null>(null);
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccess | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingCommitId, setEditingCommitId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [aiModels, setAiModels] = useState<ModelConfig[]>([]);
  const [selectedAiModelId, setSelectedAiModelId] = useState('');
  const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editingProjectTitle, setEditingProjectTitle] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState('');
  const [savingProjectTitle, setSavingProjectTitle] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const latestBranchLoad = useRef<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );
  const canManageWorkspace = Boolean(
    workspaceAccess && user && (
      workspaceAccess.owner_id === user.id ||
      workspaceAccess.role === 'self' ||
      workspaceAccess.role === 'admin' ||
      workspaceAccess.role === 'global_admin' ||
      user.is_global_admin
    )
  );

  const canManageProject = Boolean(
    project && user && (
      project.owner_id === user.id ||
      canManageWorkspace ||
      user.is_global_admin
    )
  );
  const canDeleteSelectedBranch = Boolean(selectedBranch && !selectedBranch.is_default);
  const hasProjectActions = canManageProject || canDeleteSelectedBranch;

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [actionsMenuOpen]);

  const loadProject = useCallback(async () => {
    try {
      const res = await api.get<Project>(`/api/projects/${params.pid}`);
      setProject(res.data);
      const workspaceRes = await api.get<WorkspaceAccess[]>('/api/workspaces');
      setWorkspaceAccess(
        workspaceRes.data.find((workspace) => workspace.id === res.data.workspace_id) ?? null
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  }, [params.pid]);

  const loadGraph = useCallback(async () => {
    try {
      const res = await api.get<ProjectGraph>(`/api/projects/${params.pid}/graph`);
      setGraph(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  }, [params.pid]);

  const loadBranches = useCallback(async () => {
    try {
      const res = await api.get<Branch[]>(`/api/projects/${params.pid}/branches`);
      setBranches(res.data);
      setSelectedBranchId((current) => {
        if (current && res.data.some((branch) => branch.id === current)) return current;
        return res.data.find((branch) => branch.is_default)?.id ?? res.data[0]?.id ?? '';
      });
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  }, [params.pid]);

  const loadCommits = useCallback(
    async (branchId: string, options: { loadHead?: boolean } = {}) => {
      if (!branchId) return;
      try {
        const res = await api.get<Commit[]>(
          `/api/projects/${params.pid}/commits?branch_id=${encodeURIComponent(branchId)}`
        );
        setCommits(res.data);
        if (options.loadHead) {
          latestBranchLoad.current = branchId;
          setEditingCommitId(null);
          if (res.data.length > 0) {
            const latest = await api.get<CommitDetail>(`/api/commits/${res.data[0].id}`);
            if (latestBranchLoad.current === branchId) {
              setText(latest.data.content);
              setMessage(latest.data.message ?? '');
            }
          } else {
            setText('');
            setMessage('');
          }
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    },
    [params.pid]
  );

  const refreshCurrentBranch = useCallback(async () => {
    await Promise.all([loadBranches(), loadGraph()]);
    if (selectedBranchId) await loadCommits(selectedBranchId);
  }, [loadBranches, loadCommits, loadGraph, selectedBranchId]);

  useEffect(() => {
    loadProject();
    loadBranches();
    loadGraph();
  }, [loadBranches, loadGraph, loadProject]);

  useEffect(() => {
    if (selectedBranchId) loadCommits(selectedBranchId, { loadHead: true });
  }, [loadCommits, selectedBranchId]);

  const onCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setCommitting(true);
    setError(null);
    try {
      if (editingCommitId) {
        await api.patch(`/api/commits/${editingCommitId}`, {
          content: text,
          message: message.trim() || undefined,
        });
      } else {
        await api.post(`/api/projects/${params.pid}/commits`, {
          content: text,
          message: message.trim() || undefined,
          branch_id: selectedBranchId || undefined,
        });
      }
      await refreshCurrentBranch();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setCommitting(false);
    }
  };

  const editCommit = async (commit: Commit) => {
    setError(null);
    try {
      const res = await api.get<CommitDetail>(`/api/commits/${commit.id}`);
      setText(res.data.content);
      setMessage(res.data.message ?? '');
      setEditingCommitId(commit.id);
      setExpandedId(commit.id);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const deleteCommit = async (commit: Commit) => {
    setError(null);
    try {
      await api.delete(`/api/commits/${commit.id}`);
      if (editingCommitId === commit.id) {
        setEditingCommitId(null);
        setText('');
        setMessage('');
      }
      await refreshCurrentBranch();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setConfirmState((current) => (current?.kind === 'delete-commit' && current.commitId === commit.id ? null : current));
    }
  };

  const forkCommit = async (commit: Commit, name: string) => {
    setError(null);
    const res = await api.post<Branch>(`/api/commits/${commit.id}/fork`, { name });
    await Promise.all([loadBranches(), loadGraph()]);
    setSelectedBranchId(res.data.id);
    setExpandedId(commit.id);
  };

  const deleteBranch = async (branch: Branch) => {
    if (branch.is_default) return;
    setDeletingBranchId(branch.id);
    setError(null);
    try {
      await api.delete(`/api/projects/${params.pid}/branches/${branch.id}`);
      const fallbackBranchId = branches.find((item) => item.id !== branch.id && item.is_default)?.id
        ?? branches.find((item) => item.id !== branch.id)?.id
        ?? '';
      setSelectedBranchId(fallbackBranchId);
      await Promise.all([loadBranches(), loadGraph()]);
      if (fallbackBranchId) await loadCommits(fallbackBranchId, { loadHead: true });
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setDeletingBranchId(null);
      setConfirmState((current) => (current?.kind === 'delete-branch' && current.branchId === branch.id ? null : current));
    }
  };

  const selectGraphCommit = (commit: GraphCommit) => {
    if (commit.branch_id && commit.branch_id !== selectedBranchId) {
      setSelectedBranchId(commit.branch_id);
    }
    setExpandedId(commit.id);
  };

  const loadAiConversation = useCallback(async () => {
    setAiError(null);
    try {
      const res = await api.get<AiConversationResponse>(`/api/projects/${params.pid}/ai/conversation`);
      setAiMessages(res.data.messages);
      setAiLoaded(true);
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message);
    }
  }, [params.pid]);

  const loadAiModels = useCallback(async () => {
    if (!project) return;
    setAiError(null);
    try {
      const [list, active] = await Promise.all([
        api.get<ModelConfig[]>(`/api/workspaces/${project.workspace_id}/models`),
        api.get<{ active_model_config_id: string | null }>(`/api/workspaces/${project.workspace_id}/active-model`),
      ]);
      setAiModels(list.data);
      setSelectedAiModelId((current) => {
        if (current && list.data.some((model) => model.id === current)) return current;
        return active.data.active_model_config_id ?? list.data.find((model) => model.is_default)?.id ?? list.data[0]?.id ?? '';
      });
      setAiModelsLoaded(true);
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message);
      setAiModelsLoaded(true);
    }
  }, [project]);

  useEffect(() => {
    if (aiOpen && !aiLoaded) loadAiConversation();
  }, [aiLoaded, aiOpen, loadAiConversation]);

  useEffect(() => {
    if (aiOpen && project && !aiModelsLoaded) loadAiModels();
  }, [aiModelsLoaded, aiOpen, loadAiModels, project]);

  const deleteProject = async () => {
    if (!project) return;
    setDeletingProject(true);
    setError(null);
    try {
      await api.delete(`/api/projects/${params.pid}`);
      router.push(`/w/${project.workspace_id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
      setDeletingProject(false);
    } finally {
      setConfirmState((current) => (current?.kind === 'delete-project' ? null : current));
    }
  };

  const startProjectRename = () => {
    setProjectTitleDraft(project?.title ?? '');
    setEditingProjectTitle(true);
    setActionsMenuOpen(false);
    setError(null);
  };

  const cancelProjectRename = () => {
    setEditingProjectTitle(false);
    setProjectTitleDraft(project?.title ?? '');
  };

  const saveProjectTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !projectTitleDraft.trim()) return;

    setSavingProjectTitle(true);
    setError(null);
    try {
      const res = await api.patch<Project>(`/api/projects/${params.pid}`, {
        title: projectTitleDraft.trim(),
      });
      setProject(res.data);
      setProjectTitleDraft(res.data.title);
      setEditingProjectTitle(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSavingProjectTitle(false);
    }
  };

  const sendProjectAiMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = aiInput.trim();
    if (!value) return;

    const userMessage = temporaryAiMessage('user', value);
    const assistantMessage = temporaryAiMessage('assistant', '');

    setAiLoading(true);
    setAiError(null);
    setAiInput('');
    setAiMessages((prev) => [...prev, userMessage, assistantMessage]);
    setAiLoaded(true);

    const query = new URLSearchParams({ message: value });
    if (selectedBranchId) query.set('branch_id', selectedBranchId);
    if (selectedAiModelId) query.set('model_config_id', selectedAiModelId);

    try {
      const response = await authFetch(`/api/projects/${params.pid}/ai/chat/stream?${query.toString()}`);
      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `AI request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const applyEvent = (event: string) => {
        const lines = event.split('\n');
        const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        if (!data) return;
        if (eventName === 'error') throw new Error(data);
        if (eventName === 'user_message') {
          const persisted = JSON.parse(data) as AiMessage;
          setAiMessages((prev) => prev.map((message) => (message.id === userMessage.id ? persisted : message)));
          return;
        }
        if (eventName === 'assistant_message') {
          const persisted = JSON.parse(data) as AiMessage;
          setAiMessages((prev) => prev.map((message) => (message.id === assistantMessage.id ? persisted : message)));
          return;
        }
        if (eventName === 'done') return;

        const parsed = JSON.parse(data) as { delta?: string };
        if (parsed.delta) {
          setAiMessages((prev) => prev.map((message) => (
            message.id === assistantMessage.id
              ? { ...message, content: message.content + parsed.delta }
              : message
          )));
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        buffer += decoder.decode(chunk ?? new Uint8Array(), { stream: !done });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) applyEvent(part);
        if (done) break;
      }
      if (buffer.trim()) applyEvent(buffer);
    } catch (e: any) {
      setAiInput(value);
      setAiError(e.message);
      setAiMessages((prev) => prev.filter((message) => message.id !== userMessage.id && message.id !== assistantMessage.id));
    } finally {
      setAiLoading(false);
    }
  };

  const clearProjectAi = async () => {
    setAiError(null);
    try {
      await api.delete(`/api/projects/${params.pid}/ai/conversation`);
      setAiMessages([]);
      setAiLoaded(true);
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message);
    } finally {
      setConfirmState((current) => (current?.kind === 'clear-ai' ? null : current));
    }
  };

  return (
    <AppShell>
      <div className="mb-8">
        {project && (
          <Link href={`/w/${project.workspace_id}`} className="btn-ghost -ml-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t.project.backToWorkspace}
          </Link>
        )}
        <header className="surface overflow-visible p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="page-kicker mb-3">Research Git</p>
              {editingProjectTitle ? (
                <form onSubmit={saveProjectTitle} className="max-w-2xl space-y-3">
                  <input
                    value={projectTitleDraft}
                    onChange={(e) => setProjectTitleDraft(e.target.value)}
                    className="input-field h-11 text-[18px] sm:text-[20px]"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" disabled={savingProjectTitle || !projectTitleDraft.trim()} className="btn-primary h-9 px-3 text-[12px]">
                      {savingProjectTitle ? t.common.saving : t.common.saveChanges}
                    </button>
                    <button type="button" onClick={cancelProjectRename} className="btn-ghost h-9 px-2.5 text-[12px]">
                      {t.common.cancel}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <h1 className="gradient-text text-[38px] leading-[0.94] sm:text-[54px]">
                    {project?.title ?? '—'}
                  </h1>
                  {project?.description && (
                    <p className="themed-muted mt-4 max-w-2xl text-[15px] leading-7">
                      {project.description}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <button type="button" onClick={() => setAiOpen(true)} className="btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.8 4.4L18 9.2l-4.2 1.8L12 15.5 10.2 11 6 9.2l4.2-1.8L12 3Z" />
                  <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
                </svg>
                {t.project.projectAi}
              </button>
              {branches.length > 0 && (
                <label className="sm:min-w-[12rem]">
                  <span className="sr-only">{t.project.branch}</span>
                  <select
                    id="project-branch"
                    name="branch"
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="input-field h-10 py-0 text-[13px]"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}{branch.is_default ? ` · ${t.project.defaultBranch}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasProjectActions && (
                <div ref={actionsMenuOpen ? actionsMenuRef : undefined} className="relative shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen((current) => !current)}
                    className="chrome-button h-9 w-9 justify-center px-0"
                    aria-label={t.common.moreActions}
                    title={t.common.moreActions}
                  >
                    <MoreActionsIcon />
                  </button>
                  {actionsMenuOpen && (
                    <div className="menu-panel absolute right-0 top-full z-20 mt-2 w-56">
                      {canManageProject && (
                        <button type="button" onClick={startProjectRename} className="menu-item">
                          {t.common.rename}
                        </button>
                      )}
                      {canDeleteSelectedBranch && selectedBranch && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmState({ kind: 'delete-branch', branchId: selectedBranch.id, branchName: selectedBranch.name });
                            setActionsMenuOpen(false);
                          }}
                          disabled={deletingBranchId === selectedBranch.id}
                          className="menu-item-danger"
                        >
                          {t.project.deleteBranch}
                        </button>
                      )}
                      {canManageProject && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!project) return;
                            setConfirmState({ kind: 'delete-project', projectTitle: project.title });
                            setActionsMenuOpen(false);
                          }}
                          disabled={deletingProject}
                          className="menu-item-danger"
                        >
                          {t.project.deleteProject}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={onCommit} className="editor-panel flex min-h-[620px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 pb-3 pt-4 sm:px-6" style={{ borderColor: 'var(--editor-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--editor-muted)]">
                {t.project.editor}
              </span>
              <span className="editor-pill">
                <span className="pill-dot" />
                {t.project.markdown}
              </span>
              {selectedBranch && (
                <span className="editor-pill">
                  <span className="pill-dot" />
                  {selectedBranch.name}
                </span>
              )}
              {editingCommitId && (
                <span className="editor-pill">
                  {t.project.editVersion} · {shortId(editingCommitId)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="editor-mode-switch" role="group" aria-label={t.project.documentPreview}>
                <EditorModeButton active={editorMode === 'edit'} onClick={() => setEditorMode('edit')}>
                  {t.project.editMode}
                </EditorModeButton>
                <EditorModeButton active={editorMode === 'preview'} onClick={() => setEditorMode('preview')}>
                  {t.project.previewMode}
                </EditorModeButton>
                <EditorModeButton active={editorMode === 'split'} onClick={() => setEditorMode('split')}>
                  {t.project.splitMode}
                </EditorModeButton>
              </div>
              <span className="editor-pill">
                {text.length.toLocaleString(localeFor(language))} {t.project.chars}
              </span>
              {editingCommitId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommitId(null);
                    setMessage('');
                  }}
                  className="btn-ghost"
                >
                  {t.project.cancelEdit}
                </button>
              )}
            </div>
          </div>
          <div className={`editor-document-grid ${editorMode === 'split' ? 'editor-document-split' : ''}`}>
            {(editorMode === 'edit' || editorMode === 'split') && (
              <textarea
                id="commit-content"
                name="content"
                aria-label={t.project.editor}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.project.draftPlaceholder}
                className="editor-textarea"
                spellCheck={false}
              />
            )}
            {(editorMode === 'preview' || editorMode === 'split') && (
              <div className="editor-preview-pane" aria-label={t.project.documentPreview}>
                <MarkdownPreview content={text} emptyText={t.project.emptyPreview} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center" style={{ borderColor: 'var(--editor-border)', background: 'var(--editor-surface-elevated)' }}>
            <input
              id="commit-message"
              name="message"
              aria-label={t.project.commitMessage}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.project.commitMessage}
              className="input-field flex-1"
            />
            <button type="submit" disabled={committing || !text.trim() || !selectedBranchId} className="btn-primary sm:shrink-0">
              {committing
                ? editingCommitId
                  ? t.project.savingVersion
                  : t.project.committing
                : editingCommitId
                  ? t.project.saveVersion
                  : t.project.commit}
            </button>
          </div>
        </form>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <GraphPanel
            graph={graph}
            branches={branches}
            selectedBranchId={selectedBranchId}
            selectedCommitId={expandedId}
            onSelectBranch={setSelectedBranchId}
            onSelectCommit={selectGraphCommit}
          />

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="themed-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {t.project.history}
                </h2>
                {selectedBranch && (
                  <p className="themed-faint mt-1 text-[12px]">
                    {t.project.branch}: {selectedBranch.name}
                  </p>
                )}
              </div>
              <span className="pill-accent">{commits.length}</span>
            </div>
            {commits.length === 0 ? (
              <p className="surface themed-muted px-5 py-6 text-center text-[13px]">
                {t.project.noCommits}
              </p>
            ) : (
              <ol className="space-y-3">
                {commits.map((c, i) => (
                  <CommitRow
                    key={c.id}
                    commit={c}
                    index={commits.length - i}
                    expanded={expandedId === c.id}
                    editing={editingCommitId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onEdit={() => editCommit(c)}
                    onDelete={() => setConfirmState({ kind: 'delete-commit', commitId: c.id })}
                    onFork={(name) => forkCommit(c, name)}
                    onAiGenerated={refreshCurrentBranch}
                  />
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {aiOpen && (
        <ProjectAiDialog
          messages={aiMessages}
          modelConfigs={aiModels}
          selectedModelId={selectedAiModelId}
          modelsLoaded={aiModelsLoaded}
          input={aiInput}
          loading={aiLoading}
          error={aiError}
          onModelChange={setSelectedAiModelId}
          onInput={setAiInput}
          onClose={() => setAiOpen(false)}
          onSubmit={sendProjectAiMessage}
          onRequestClear={() => setConfirmState({ kind: 'clear-ai' })}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          open
          title={
            confirmState.kind === 'delete-project'
              ? t.project.deleteProject
              : confirmState.kind === 'delete-branch'
                ? t.project.deleteBranch
                : confirmState.kind === 'delete-commit'
                  ? t.project.deleteVersion
                  : t.project.clearAiContext
          }
          message={
            confirmState.kind === 'delete-project'
              ? t.project.deleteProjectConfirm
              : confirmState.kind === 'delete-branch'
                ? t.project.deleteBranchConfirm
                : confirmState.kind === 'delete-commit'
                  ? t.project.deleteConfirm
                  : t.project.clearAiConfirm
          }
          detail={
            confirmState.kind === 'delete-project'
              ? confirmState.projectTitle
              : confirmState.kind === 'delete-branch'
                ? confirmState.branchName
                : null
          }
          confirmLabel={
            confirmState.kind === 'clear-ai'
              ? t.project.clearAiContext
              : t.common.delete
          }
          tone={confirmState.kind === 'clear-ai' ? 'default' : 'danger'}
          busy={
            confirmState.kind === 'delete-project'
              ? deletingProject
              : confirmState.kind === 'delete-branch'
                ? deletingBranchId === confirmState.branchId
                : false
          }
          onClose={() => setConfirmState(null)}
          onConfirm={() => {
            if (confirmState.kind === 'delete-project') {
              void deleteProject();
              return;
            }
            if (confirmState.kind === 'delete-branch') {
              const branch = branches.find((item) => item.id === confirmState.branchId);
              if (branch) void deleteBranch(branch);
              return;
            }
            if (confirmState.kind === 'delete-commit') {
              const commit = commits.find((item) => item.id === confirmState.commitId);
              if (commit) void deleteCommit(commit);
              return;
            }
            void clearProjectAi();
          }}
        />
      )}
    </AppShell>
  );
}

function StatusDot({ status }: { status: Commit['status'] }) {
  if (status === 'pending') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-amber)] shadow-[0_0_0_3px_rgba(232,165,90,0.18)]" />;
  }
  if (status === 'failed') {
    return <span className="h-2 w-2 rounded-full bg-[var(--error)] shadow-[0_0_0_3px_rgba(198,69,69,0.16)]" />;
  }
  return <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_0_3px_rgba(204,120,92,0.16)]" />;
}

function GraphPanel({
  graph,
  branches,
  selectedBranchId,
  selectedCommitId,
  onSelectBranch,
  onSelectCommit,
}: {
  graph: ProjectGraph | null;
  branches: Branch[];
  selectedBranchId: string;
  selectedCommitId: string | null;
  onSelectBranch: (branchId: string) => void;
  onSelectCommit: (commit: GraphCommit) => void;
}) {
  const { t, language } = useLanguage();
  const baseBranches = graph?.branches.length ? graph.branches : branches;
  const commits = useMemo(
    () => [...(graph?.commits ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [graph?.commits]
  );
  const graphModel = useMemo(() => {
    const commitById = new Map(commits.map((commit) => [commit.id, commit]));
    const rawBranchById = new Map(baseBranches.map((branch) => [branch.id, branch]));
    const sourceByBranchId = new Map<string, { commit: GraphCommit; branch: Branch | null }>();
    const parentBranchByBranchId = new Map<string, string | null>();

    baseBranches.forEach((branch) => {
      const sourceCommit = branch.created_from_commit_id ? commitById.get(branch.created_from_commit_id) : null;
      const sourceBranch = sourceCommit?.branch_id ? rawBranchById.get(sourceCommit.branch_id) ?? null : null;
      if (sourceCommit) sourceByBranchId.set(branch.id, { commit: sourceCommit, branch: sourceBranch });
      parentBranchByBranchId.set(branch.id, sourceBranch?.id && sourceBranch.id !== branch.id ? sourceBranch.id : null);
    });

    const childrenByParent = new Map<string, Branch[]>();
    const roots: Branch[] = [];
    baseBranches.forEach((branch) => {
      const parentId = parentBranchByBranchId.get(branch.id);
      if (parentId && rawBranchById.has(parentId)) {
        const children = childrenByParent.get(parentId) ?? [];
        children.push(branch);
        childrenByParent.set(parentId, children);
      } else {
        roots.push(branch);
      }
    });

    const sortBranches = (items: Branch[]) =>
      [...items].sort((a, b) => Number(b.is_default) - Number(a.is_default) || Date.parse(a.created_at) - Date.parse(b.created_at));
    const ordered: Branch[] = [];
    const visited = new Set<string>();
    const visit = (branch: Branch) => {
      if (visited.has(branch.id)) return;
      visited.add(branch.id);
      ordered.push(branch);
      sortBranches(childrenByParent.get(branch.id) ?? []).forEach(visit);
    };

    sortBranches(roots).forEach(visit);
    sortBranches(baseBranches).forEach(visit);

    return {
      lanes: ordered,
      branchById: new Map(ordered.map((branch) => [branch.id, branch])),
      laneByBranchId: new Map(ordered.map((branch, index) => [branch.id, index])),
      commitById,
      sourceByBranchId,
    };
  }, [baseBranches, commits]);

  const { lanes, branchById, laneByBranchId, commitById, sourceByBranchId } = graphModel;
  const rowHeight = 76;
  const laneWidth = 28;
  const laneAreaWidth = Math.max(lanes.length, 1) * laneWidth + 12;
  const graphHeight = commits.length * rowHeight;
  const laneX = (laneIndex: number) => laneIndex * laneWidth + laneWidth / 2 + 6;
  const rowY = (rowIndex: number) => rowIndex * rowHeight + rowHeight / 2;
  const rowByCommitId = useMemo(() => new Map(commits.map((commit, index) => [commit.id, index])), [commits]);
  const headsByCommit = useMemo(() => {
    const byCommit = new Map<string, Branch[]>();
    lanes.forEach((branch) => {
      if (!branch.head_commit_id) return;
      const current = byCommit.get(branch.head_commit_id) ?? [];
      current.push(branch);
      byCommit.set(branch.head_commit_id, current);
    });
    return byCommit;
  }, [lanes]);
  const forksByCommit = useMemo(() => {
    const byCommit = new Map<string, Branch[]>();
    lanes.forEach((branch) => {
      if (!branch.created_from_commit_id || branch.is_default) return;
      const current = byCommit.get(branch.created_from_commit_id) ?? [];
      current.push(branch);
      byCommit.set(branch.created_from_commit_id, current);
    });
    return byCommit;
  }, [lanes]);
  const edges = useMemo(
    () =>
      commits.flatMap((commit) => {
        if (!commit.parent_id) return [];
        const parent = commitById.get(commit.parent_id);
        const childRow = rowByCommitId.get(commit.id);
        const parentRow = parent ? rowByCommitId.get(parent.id) : undefined;
        if (!parent || childRow === undefined || parentRow === undefined) return [];
        const childLane = commit.branch_id ? laneByBranchId.get(commit.branch_id) ?? 0 : 0;
        const parentLane = parent.branch_id ? laneByBranchId.get(parent.branch_id) ?? childLane : childLane;
        const childX = laneX(childLane);
        const parentX = laneX(parentLane);
        const childY = rowY(childRow);
        const parentY = rowY(parentRow);
        const midY = childY + (parentY - childY) / 2;
        const d =
          childLane === parentLane
            ? `M ${parentX} ${parentY} L ${childX} ${childY}`
            : `M ${parentX} ${parentY} C ${parentX} ${midY} ${childX} ${midY} ${childX} ${childY}`;
        return [
          {
            key: `${parent.id}-${commit.id}`,
            d,
            color: graphLaneColor(childLane),
            active: commit.branch_id === selectedBranchId || parent.branch_id === selectedBranchId,
          },
        ];
      }),
    [commitById, commits, laneByBranchId, rowByCommitId, selectedBranchId]
  );

  return (
    <section className="surface overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="themed-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
          {t.project.graph}
        </h2>
        <span className="pill">{lanes.length} {t.project.branches}</span>
      </div>
      {lanes.length > 0 && (
        <div className="graph-branch-bar mb-4">
          {lanes.map((branch, index) => {
            const source = sourceByBranchId.get(branch.id);
            return (
              <div
                key={branch.id}
                className={`graph-branch-chip ${branch.id === selectedBranchId ? 'graph-branch-chip-active' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectBranch(branch.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="graph-lane-dot" style={{ background: graphLaneColor(index) }} />
                  <span className="truncate">{branch.name}</span>
                  {branch.is_default && <span className="graph-ref-muted">{t.project.defaultBranch}</span>}
                  {!branch.is_default && source && (
                    <span className="graph-ref-muted">
                      {t.project.forkedFrom} {source.branch?.name ?? shortId(source.commit.id)}
                    </span>
                  )}
                </button>
                {!branch.is_default && branch.id === selectedBranchId && (
                  <span className="graph-ref-muted">
                    {t.project.deleteBranch}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {commits.length === 0 ? (
        <p className="themed-muted py-4 text-center text-[13px]">{t.project.noGraph}</p>
      ) : (
        <div className="graph-table max-h-[430px] overflow-y-auto overflow-x-hidden pr-1">
          <div className="graph-stage" style={{ height: graphHeight }}>
            <svg
              className="graph-svg"
              width={laneAreaWidth}
              height={graphHeight}
              viewBox={`0 0 ${laneAreaWidth} ${graphHeight}`}
              aria-hidden="true"
            >
              {lanes.map((branch, index) => (
                <line
                  key={branch.id}
                  className="graph-lane-guide"
                  x1={laneX(index)}
                  y1={0}
                  x2={laneX(index)}
                  y2={graphHeight}
                  stroke={graphLaneColor(index)}
                />
              ))}
              {edges.map((edge) => (
                <path
                  key={edge.key}
                  className="graph-edge"
                  d={edge.d}
                  stroke={edge.color}
                  opacity={edge.active ? 0.92 : 0.46}
                />
              ))}
              {commits.map((commit, index) => {
                const laneIndex = commit.branch_id ? laneByBranchId.get(commit.branch_id) ?? 0 : 0;
                const x = laneX(laneIndex);
                const y = rowY(index);
                const selected = selectedCommitId === commit.id;
                return (
                  <g key={commit.id}>
                    {selected && <circle className="graph-node-selection" cx={x} cy={y} r={10} />}
                    <circle
                      className="graph-svg-node"
                      cx={x}
                      cy={y}
                      r={commit.is_head ? 6.4 : 5.2}
                      fill={graphLaneColor(laneIndex)}
                    />
                  </g>
                );
              })}
            </svg>
            {commits.map((commit, index) => {
              const branch = commit.branch_id ? branchById.get(commit.branch_id) : null;
              const heads = headsByCommit.get(commit.id) ?? [];
              const forks = forksByCommit.get(commit.id) ?? [];
              return (
                <button
                  key={commit.id}
                  type="button"
                  onClick={() => onSelectCommit(commit)}
                  className={`graph-row graph-row-layer ${selectedCommitId === commit.id ? 'graph-row-active' : ''}`}
                  style={{ top: index * rowHeight, height: rowHeight }}
                >
                  <div className="graph-lanes" style={{ width: laneAreaWidth }} />
                  <div className="min-w-0 flex-1 py-3">
                    <div className="mb-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
                      <span className="graph-message truncate">
                        {commit.message || t.project.noMessage}
                      </span>
                      {heads.map((head) => (
                        <span key={head.id} className={`graph-ref ${head.id === selectedBranchId ? 'graph-ref-active' : ''}`}>
                          {head.name}
                        </span>
                      ))}
                      {heads.length > 0 && <span className="graph-ref-muted">{t.project.head}</span>}
                      {forks.map((fork) => (
                        <span key={fork.id} className="graph-fork-ref">
                          {t.project.forksHere} {fork.name}
                        </span>
                      ))}
                    </div>
                    <p className="themed-faint text-[11px]">
                      {formatDate(commit.created_at, language)} · {shortId(commit.id)}
                      {branch ? ` · ${branch.name}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function graphLaneColor(index: number) {
  const colors = ['#cc785c', '#5db8a6', '#e8a55a', '#8c7b6b', '#b46a51', '#6f8f87'];
  return colors[index % colors.length];
}

function ProjectAiDialog({
  messages,
  modelConfigs,
  selectedModelId,
  modelsLoaded,
  input,
  loading,
  error,
  onModelChange,
  onInput,
  onClose,
  onSubmit,
  onRequestClear,
}: {
  messages: AiMessage[];
  modelConfigs: ModelConfig[];
  selectedModelId: string;
  modelsLoaded: boolean;
  input: string;
  loading: boolean;
  error: string | null;
  onModelChange: (value: string) => void;
  onInput: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onRequestClear: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,20,19,0.28)] p-3 sm:items-center sm:p-6">
      <section className="surface flex h-[min(760px,92vh)] w-full max-w-2xl flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--surface-border-soft)' }}>
          <div>
            <p className="themed-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
              {t.project.projectAi}
            </p>
            <h2 className="themed-text mt-1 text-[18px] font-semibold tracking-[-0.03em]">
              {t.project.aiAssistant}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRequestClear} className="btn-ghost">
              {t.project.clearAiContext}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost h-9 w-9 px-0" aria-label={t.common.cancel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: 'var(--surface-border-soft)' }}>
          <label className="block">
            <span className="themed-muted mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em]">
              {t.project.aiModel}
            </span>
            <select
              id="project-ai-model"
              name="project-ai-model"
              value={selectedModelId}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={loading || !modelsLoaded || modelConfigs.length === 0}
              className="input-field h-10 w-full py-0 text-[13px]"
            >
              {modelConfigs.length === 0 ? (
                <option value="">{modelsLoaded ? t.project.noAiModels : t.common.loading}</option>
              ) : (
                modelConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.scope === 'workspace' ? t.models.shared : t.models.personal} · {config.name} · {config.model}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="themed-muted max-w-sm text-[14px] leading-6">{t.project.aiEmpty}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-3xl px-4 py-3 text-[13px] leading-6 ${
                    message.role === 'user'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'border themed-surface themed-text'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content || (loading ? t.project.streaming : '')}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t p-3 sm:p-4" style={{ borderColor: 'var(--surface-border-soft)' }}>
          {error && <div className="alert-error mb-3 text-[12px]">{error}</div>}
          <div className="flex items-end gap-2">
            <textarea
              id="project-ai-input"
              name="project-ai-input"
              value={input}
              onChange={(e) => onInput(e.target.value)}
              placeholder={t.project.aiQuestionPlaceholder}
              rows={2}
              className="textarea-field min-h-[3rem] flex-1 text-[13px]"
            />
            <button type="submit" disabled={loading || !input.trim() || modelConfigs.length === 0} className="btn-primary shrink-0">
              {loading ? t.project.sending : t.project.send}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CommitRow({
  commit,
  index,
  expanded,
  editing,
  onToggle,
  onEdit,
  onDelete,
  onFork,
  onAiGenerated,
}: {
  commit: Commit;
  index: number;
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFork: (name: string) => Promise<void>;
  onAiGenerated: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [similar, setSimilar] = useState<SimilarCommit[]>([]);
  const [similarLoaded, setSimilarLoaded] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [aiOutputs, setAiOutputs] = useState<AiOutput[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoadingKind, setAiLoadingKind] = useState<AiOutput['kind'] | null>(null);
  const [forkOpen, setForkOpen] = useState(false);
  const [forkName, setForkName] = useState(`fork-${shortId(commit.id)}`);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    api.get<Review[]>(`/api/commits/${commit.id}/reviews`)
      .then((r) => setReviews(r.data))
      .catch(() => {});
    api.get<AiOutput[]>(`/api/commits/${commit.id}/ai`)
      .then((r) => setAiOutputs(r.data))
      .catch(() => {});
  }, [expanded, commit.id]);

  const postReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    setPosting(true);
    setReviewError(null);
    try {
      const res = await api.post<Review>(`/api/commits/${commit.id}/reviews`, {
        content: reviewText.trim(),
      });
      setReviews((prev) => [...prev, res.data]);
      setReviewText('');
    } catch (e: any) {
      setReviewError(e?.response?.data?.detail || e.message);
    } finally {
      setPosting(false);
    }
  };

  const loadSimilar = async () => {
    setSimilarLoading(true);
    try {
      const res = await api.get<SimilarCommit[]>(`/api/commits/${commit.id}/similar?limit=3`);
      setSimilar(res.data);
      setSimilarLoaded(true);
    } catch {
      setSimilar([]);
      setSimilarLoaded(true);
    } finally {
      setSimilarLoading(false);
    }
  };

  const runAi = async (kind: AiOutput['kind']) => {
    setAiLoadingKind(kind);
    setAiError(null);
    try {
      const res = await api.post<AiOutput>(`/api/commits/${commit.id}/ai`, { kind });
      setAiOutputs((prev) => [res.data, ...prev]);
      await onAiGenerated();
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message);
    } finally {
      setAiLoadingKind(null);
    }
  };

  const submitFork = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = forkName.trim();
    if (!name) return;
    setForking(true);
    setAiError(null);
    try {
      await onFork(name);
      setForkOpen(false);
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message);
    } finally {
      setForking(false);
    }
  };

  const aiLabel = (kind: AiOutput['kind']) =>
    kind === 'diff_summary' ? t.project.diffSummary : t.project.cumulativeSummary;

  return (
    <li className={`surface overflow-hidden ${editing ? 'ring-1 ring-[rgba(204,120,92,0.42)]' : ''}`}>
      <div className="flex items-start gap-2 px-4 py-3.5 transition-all hover:bg-[var(--surface-bg-strong)] sm:gap-3 sm:px-4">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="pt-1.5">
            <StatusDot status={commit.status} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--accent-primary)]">v{index}</span>
              <span className="themed-text truncate text-[13px] font-semibold">
                {commit.message || t.project.noMessage}
              </span>
              {editing && <span className="pill h-5 px-2 text-[10px]">{t.project.editVersion}</span>}
            </div>
            {commit.llm_summary && (
              <p className="themed-muted mt-1 line-clamp-2 text-[12px] leading-relaxed">
                {commit.llm_summary}
              </p>
            )}
            {commit.status === 'pending' && (
              <p className="mt-1 text-[11px] text-[var(--accent-amber)]">{t.project.analyzing}</p>
            )}
            {commit.status === 'failed' && (
              <p className="mt-1 text-[11px] text-[var(--error)]">{t.project.failed}</p>
            )}
            <p className="themed-faint mt-2 text-[11px]">
              {formatDate(commit.created_at, language)} · {shortId(commit.id)}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
          <button type="button" onClick={onEdit} className="btn-ghost h-9 px-2.5 text-[11px]">
            {t.project.editVersion}
          </button>
          <button type="button" onClick={() => runAi('diff_summary')} disabled={!!aiLoadingKind} className="btn-ghost h-9 px-2.5 text-[11px]">
            {aiLoadingKind === 'diff_summary' ? t.project.analyzing : t.project.ai}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: 'var(--surface-border-soft)' }}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={() => runAi('diff_summary')} disabled={!!aiLoadingKind} className="btn-secondary h-auto min-h-10 px-3 py-2 text-[12px]">
              {aiLoadingKind === 'diff_summary' ? t.project.analyzing : t.project.diffSummary}
            </button>
            <button type="button" onClick={() => runAi('cumulative_summary')} disabled={!!aiLoadingKind} className="btn-secondary h-auto min-h-10 px-3 py-2 text-[12px]">
              {aiLoadingKind === 'cumulative_summary' ? t.project.analyzing : t.project.cumulativeSummary}
            </button>
            <button type="button" onClick={() => setForkOpen((value) => !value)} className="btn-secondary h-auto min-h-10 px-3 py-2 text-[12px]">
              {t.project.fork}
            </button>
            <button type="button" onClick={onDelete} className="btn-destructive h-auto min-h-10 px-3 py-2 text-[12px]">
              {t.project.deleteVersion}
            </button>
          </div>

          {aiError && <div className="alert-error text-[12px]">{aiError}</div>}

          {forkOpen && (
            <form onSubmit={submitFork} className="rounded-2xl border p-3" style={{ borderColor: 'var(--surface-border-soft)', background: 'var(--surface-bg)' }}>
              <label className="label-field" htmlFor={`fork-${commit.id}`}>{t.project.forkFromVersion}</label>
              <div className="flex gap-2">
                <input
                  id={`fork-${commit.id}`}
                  value={forkName}
                  onChange={(e) => setForkName(e.target.value)}
                  placeholder={t.project.forkName}
                  className="input-field h-10 flex-1"
                />
                <button type="submit" disabled={forking || !forkName.trim()} className="btn-primary shrink-0">
                  {forking ? t.common.creating : t.project.createFork}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--surface-border-soft)', background: 'var(--surface-bg)' }}>
            <h4 className="themed-muted mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
              {t.project.aiOutputs}
            </h4>
            {aiOutputs.length === 0 ? (
              <p className="themed-faint text-[12px]">{t.project.noAiOutputs}</p>
            ) : (
              <ul className="space-y-2">
                {aiOutputs.map((output) => (
                  <li key={output.id} className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--surface-border-soft)', background: 'var(--input-bg)' }}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--accent-primary)]">
                        {aiLabel(output.kind)}
                      </span>
                      <span className="themed-faint text-[10px]">
                        {formatDate(output.created_at, language)}
                      </span>
                    </div>
                    <p className="themed-muted whitespace-pre-wrap text-[12px] leading-relaxed">
                      {output.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--surface-border-soft)', background: 'var(--surface-bg)' }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="themed-muted text-[11px] font-semibold uppercase tracking-[0.16em]">
                {t.project.similar}
              </h4>
              {!similarLoaded && (
                <button type="button" onClick={loadSimilar} disabled={similarLoading} className="btn-ghost h-7 px-2 text-[11px]">
                  {similarLoading ? t.project.analyzing : t.project.similar}
                </button>
              )}
            </div>
            {similarLoaded && similar.length === 0 && (
              <p className="themed-faint text-[12px]">{t.common.noneYet}</p>
            )}
            {similar.length > 0 && (
              <ul className="space-y-2">
                {similar.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="themed-muted truncate">
                      {s.message || <span className="themed-faint">{t.project.noMessage}</span>}
                    </span>
                    <span className="pill h-5 px-2 font-mono">
                      {Math.round(s.similarity * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="themed-muted mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
              {t.project.reviews} ({reviews.length})
            </h4>
            {reviews.length > 0 && (
              <ul className="mb-3 space-y-2">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-2xl border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--surface-border-soft)', background: 'var(--surface-bg)' }}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="themed-text font-semibold">
                        {r.reviewer_display ?? t.project.reviewer}
                      </span>
                      {r.status === 'resolved' && (
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent-amber)]">
                          {t.project.resolved}
                        </span>
                      )}
                    </div>
                    <p className="themed-muted whitespace-pre-wrap leading-relaxed">
                      {r.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={postReview} className="space-y-2">
              <textarea
                id={`review-${commit.id}`}
                name="review"
                aria-label={t.project.reviews}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={t.project.reviewPlaceholder}
                rows={2}
                className="textarea-field text-[13px]"
              />
              {reviewError && <div className="alert-error text-[12px]">{reviewError}</div>}
              {reviewText && (
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={posting} className="btn-primary">
                    {posting ? t.project.posting : t.project.postReview}
                  </button>
                  <button type="button" onClick={() => setReviewText('')} className="btn-ghost">
                    {t.common.cancel}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </li>
  );
}
