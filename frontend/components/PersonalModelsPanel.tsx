'use client';

import { useEffect, useState } from 'react';

import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { ModelConfig, ModelForm } from './ModelsManager';

interface PersonalModelGroup {
  workspace_id: string;
  workspace_name: string;
  workspace_mode: string;
  role: string;
  active_model_config_id: string | null;
  personal_models: ModelConfig[];
}

function getHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export default function PersonalModelsPanel() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<PersonalModelGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelConfig | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<PersonalModelGroup[]>('/api/me/models');
      setGroups(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setActive = async (workspaceId: string, id: string) => {
    try {
      await api.put(`/api/workspaces/${workspaceId}/active-model`, { model_config_id: id });
      setGroups((prev) =>
        prev.map((group) =>
          group.workspace_id === workspaceId ? { ...group, active_model_config_id: id } : group
        )
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const remove = async (model: ModelConfig) => {
    setDeletingId(model.id);
    try {
      await api.delete(`/api/models/${model.id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setDeletingId((current) => (current === model.id ? null : current));
      setPendingDelete((current) => (current?.id === model.id ? null : current));
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--text-primary)]">{t.profile.personalModels}</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-muted)]">
          {t.profile.personalModelsHelp}
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loaded && groups.length === 0 && (
        <p className="surface px-5 py-6 text-center text-[13px] text-[var(--text-muted)]">
          {t.profile.noModelWorkspaces}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const isCreating = creatingFor === group.workspace_id;
          return (
            <div key={group.workspace_id} className="surface overflow-hidden">
              <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--surface-border)' }}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                      {group.workspace_name}
                    </h3>
                    <span className="pill">{group.workspace_mode === 'team' ? t.modes.team : t.modes.personal}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    {group.personal_models.length} {t.profile.modelCount}{t.common.languageShort === '中' || group.personal_models.length === 1 ? '' : 's'}
                  </p>
                </div>
                {!isCreating && (
                  <button onClick={() => setCreatingFor(group.workspace_id)} className="btn-secondary self-start sm:self-auto">
                    {t.models.addModel}
                  </button>
                )}
              </div>

              {isCreating && (
                <div className="px-5 pt-5">
                  <ModelForm
                    workspaceId={group.workspace_id}
                    isAdmin={false}
                    existing={null}
                    fixedScope="user"
                    onClose={() => setCreatingFor(null)}
                    onSaved={() => {
                      setCreatingFor(null);
                      load();
                    }}
                  />
                </div>
              )}

              {editing && editing.workspace_id === group.workspace_id && (
                <div className="px-5 pt-5">
                  <ModelForm
                    workspaceId={group.workspace_id}
                    isAdmin={false}
                    existing={editing}
                    fixedScope="user"
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      load();
                    }}
                  />
                </div>
              )}

              {group.personal_models.length > 0 ? (
                <ul className="divide-y" style={{ borderColor: 'var(--surface-border)' }}>
                  {group.personal_models.map((model) => {
                    const active = group.active_model_config_id === model.id;
                    return (
                      <li key={model.id} className="flex flex-col gap-3 px-5 py-4 transition-all hover:bg-[var(--surface-bg-strong)] sm:flex-row sm:items-center">
                        <button
                          onClick={() => setActive(group.workspace_id, model.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                            active
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] shadow-[0_0_0_3px_rgba(204,120,92,0.16)]'
                              : 'border-[var(--surface-border)] bg-[var(--input-bg)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-bg-strong)]'
                          }`}
                          aria-label={active ? t.models.active : t.models.setActive}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{model.name}</span>
                            {active && <span className="pill-accent">{t.models.active}</span>}
                          </div>
                          <div className="mt-1 truncate text-[12px] text-[var(--text-muted)]">
                            <span className="font-mono text-[var(--text-secondary)]">{model.model}</span>
                            {model.embedding_model && <span> · {model.embedding_model}</span>}
                            <span className="text-[var(--text-faint)]"> · </span>
                            <span className="font-mono">{getHost(model.base_url)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                          <button onClick={() => setEditing(model)} className="btn-ghost">
                            {t.common.edit}
                          </button>
                          <button onClick={() => setPendingDelete(model)} className="btn-destructive">
                            {t.common.delete}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                loaded && !isCreating && (
                  <p className="px-5 py-6 text-center text-[13px] text-[var(--text-muted)]">
                    {t.models.nonePersonal}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          open
          title={t.common.delete}
          message={t.models.deleteConfirm}
          detail={pendingDelete.name}
          confirmLabel={t.common.delete}
          busy={deletingId === pendingDelete.id}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </section>
  );
}
