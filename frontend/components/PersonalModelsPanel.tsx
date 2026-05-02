'use client';

import { useEffect, useState } from 'react';

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

  const remove = async (id: string) => {
    if (!confirm(t.models.deleteConfirm)) return;
    try {
      await api.delete(`/api/models/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-white">{t.profile.personalModels}</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-violet-100/62">
          {t.profile.personalModelsHelp}
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loaded && groups.length === 0 && (
        <p className="surface px-5 py-6 text-center text-[13px] text-violet-100/52">
          {t.profile.noModelWorkspaces}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const isCreating = creatingFor === group.workspace_id;
          return (
            <div key={group.workspace_id} className="surface overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-white">
                      {group.workspace_name}
                    </h3>
                    <span className="pill">{group.workspace_mode === 'team' ? t.modes.team : t.modes.personal}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-violet-100/50">
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
                <ul className="divide-y divide-white/10">
                  {group.personal_models.map((model) => {
                    const active = group.active_model_config_id === model.id;
                    return (
                      <li key={model.id} className="flex flex-col gap-3 px-5 py-4 transition-all hover:bg-white/10 sm:flex-row sm:items-center">
                        <button
                          onClick={() => setActive(group.workspace_id, model.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                            active
                              ? 'border-fuchsia-200 bg-gradient-to-r from-violet-400 to-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.8)]'
                              : 'border-white/25 bg-white/10 hover:border-fuchsia-200/70 hover:bg-white/15'
                          }`}
                          aria-label={active ? t.models.active : t.models.setActive}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-white">{model.name}</span>
                            {active && <span className="pill-dark">{t.models.active}</span>}
                          </div>
                          <div className="mt-1 truncate text-[12px] text-violet-100/55">
                            <span className="font-mono text-violet-50/75">{model.model}</span>
                            {model.embedding_model && <span> · {model.embedding_model}</span>}
                            <span className="text-violet-100/30"> · </span>
                            <span className="font-mono">{getHost(model.base_url)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                          <button onClick={() => setEditing(model)} className="btn-ghost">
                            {t.common.edit}
                          </button>
                          <button onClick={() => remove(model.id)} className="btn-ghost text-red-100/70 hover:text-red-100">
                            {t.common.delete}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                loaded && !isCreating && (
                  <p className="px-5 py-6 text-center text-[13px] text-violet-100/52">
                    {t.models.nonePersonal}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
