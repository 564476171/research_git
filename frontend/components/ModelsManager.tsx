'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

export interface ModelConfig {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  scope: 'workspace' | 'user';
  name: string;
  base_url: string;
  model: string;
  embedding_model: string | null;
  is_default: boolean;
  created_at: string;
}

interface ModelsManagerProps {
  workspaceId: string;
  currentRole: string;
}

function getHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export default function ModelsManager({ workspaceId, currentRole }: ModelsManagerProps) {
  const { t } = useLanguage();
  const isAdmin = currentRole === 'admin' || currentRole === 'self' || currentRole === 'global_admin';
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [list, active] = await Promise.all([
        api.get<ModelConfig[]>(`/api/workspaces/${workspaceId}/models`),
        api.get<{ active_model_config_id: string | null }>(`/api/workspaces/${workspaceId}/active-model`),
      ]);
      setConfigs(list.data);
      setActiveId(active.data.active_model_config_id);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const setActive = async (id: string) => {
    try {
      await api.put(`/api/workspaces/${workspaceId}/active-model`, { model_config_id: id });
      setActiveId(id);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t.models.deleteConfirm)) return;
    try {
      await api.delete(`/api/models/${id}`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const shared = configs.filter((c) => c.scope === 'workspace');
  const personal = configs.filter((c) => c.scope === 'user');

  const renderRow = (c: ModelConfig) => {
    const active = activeId === c.id;
    return (
      <li key={c.id} className="flex flex-col gap-3 px-5 py-4 transition-all hover:bg-white/10 sm:flex-row sm:items-center">
        <button
          onClick={() => setActive(c.id)}
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
            <span className="truncate text-[14px] font-semibold text-white">{c.name}</span>
            {active && <span className="pill-dark">{t.models.active}</span>}
            {c.is_default && (
              <span className="pill border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                {t.models.default}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[12px] text-violet-100/55">
            <span className="font-mono text-violet-50/75">{c.model}</span>
            {c.embedding_model && <span> · {c.embedding_model}</span>}
            <span className="text-violet-100/30"> · </span>
            <span className="font-mono">{getHost(c.base_url)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:justify-end">
          <button onClick={() => setEditing(c)} className="btn-ghost">
            {t.common.edit}
          </button>
          <button onClick={() => remove(c.id)} className="btn-ghost text-red-100/70 hover:text-red-100">
            {t.common.delete}
          </button>
        </div>
      </li>
    );
  };

  return (
    <section>
      {error && <div className="alert-error mb-5">{error}</div>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-[13px] leading-6 text-violet-100/62">
          {t.models.intro}
        </p>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className="btn-secondary self-start sm:self-auto">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t.models.addModel}
          </button>
        )}
      </div>

      {(showForm || editing) && (
        <ModelForm
          workspaceId={workspaceId}
          isAdmin={isAdmin}
          existing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      <div className="space-y-6">
        {isAdmin && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/55">
              {t.models.shared}
            </h3>
            {shared.length > 0 ? (
              <ul className="surface divide-y divide-white/10 overflow-hidden">{shared.map(renderRow)}</ul>
            ) : (
              <p className="surface px-5 py-6 text-center text-[13px] text-violet-100/52">
                {t.models.noShared}
              </p>
            )}
          </div>
        )}

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/55">
            {isAdmin ? t.models.personal : t.models.available}
          </h3>
          {!isAdmin && shared.length > 0 && (
            <ul className="surface mb-3 divide-y divide-white/10 overflow-hidden">{shared.map(renderRow)}</ul>
          )}
          {personal.length > 0 ? (
            <ul className="surface divide-y divide-white/10 overflow-hidden">{personal.map(renderRow)}</ul>
          ) : (
            loaded && (
              <p className="surface px-5 py-6 text-center text-[13px] text-violet-100/52">
                {t.models.nonePersonal}
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}

export interface ModelFormProps {
  workspaceId: string;
  isAdmin: boolean;
  existing: ModelConfig | null;
  fixedScope?: 'workspace' | 'user';
  onClose: () => void;
  onSaved: () => void;
}

export function ModelForm({ workspaceId, isAdmin, existing, fixedScope, onClose, onSaved }: ModelFormProps) {
  const { t } = useLanguage();
  const [scope, setScope] = useState<'workspace' | 'user'>(
    fixedScope ?? existing?.scope ?? (isAdmin ? 'workspace' : 'user')
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? 'https://api.openai.com/v1');
  const [model, setModel] = useState(existing?.model ?? '');
  const [embeddingModel, setEmbeddingModel] = useState(existing?.embedding_model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        const body: Record<string, unknown> = {
          name,
          base_url: baseUrl,
          model,
          embedding_model: embeddingModel || null,
          is_default: isDefault,
        };
        if (apiKey) body.api_key = apiKey;
        await api.patch(`/api/models/${existing.id}`, body);
      } else {
        if (!apiKey) {
          setError(t.models.requiredKey);
          setSaving(false);
          return;
        }
        await api.post(`/api/workspaces/${workspaceId}/models`, {
          scope,
          name,
          base_url: baseUrl,
          model,
          embedding_model: embeddingModel || null,
          api_key: apiKey,
          is_default: isDefault && scope === 'workspace',
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="surface mb-5 space-y-4 p-5">
      <h3 className="text-[14px] font-semibold text-white">
        {existing ? t.models.editModel : t.models.addModel}
      </h3>

      {!existing && isAdmin && !fixedScope && (
        <div>
          <label className="label-field">{t.models.scope}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['workspace', 'user'] as const).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setScope(s)}
                className={`h-10 rounded-full border px-3 text-[13px] font-semibold transition-all ${
                  scope === s
                    ? 'border-fuchsia-300/45 bg-gradient-to-r from-violet-500/35 to-fuchsia-500/35 text-white shadow-[0_12px_32px_-22px_rgba(217,70,239,1)]'
                    : 'border-white/12 bg-white/[0.05] text-violet-100/65 hover:border-white/25 hover:bg-white/10 hover:text-white'
                }`}
              >
                {s === 'workspace' ? t.models.sharedAdmin : t.models.personalOnly}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label-field" htmlFor="m-name">{t.models.name}</label>
        <input
          id="m-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t.models.namePlaceholder}
          className="input-field"
        />
      </div>

      <div>
        <label className="label-field" htmlFor="m-base">{t.models.baseUrl}</label>
        <input
          id="m-base"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
          placeholder={t.models.basePlaceholder}
          className="input-field font-mono text-[13px]"
        />
        <p className="mt-1.5 text-[11px] text-violet-100/42">
          {t.models.baseHelp}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label-field" htmlFor="m-model">{t.models.chatModel}</label>
          <input
            id="m-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            placeholder={t.models.chatPlaceholder}
            className="input-field font-mono text-[13px]"
          />
        </div>
        <div>
          <label className="label-field" htmlFor="m-embed">{t.models.embeddingModel}</label>
          <input
            id="m-embed"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder={t.models.embeddingPlaceholder}
            className="input-field font-mono text-[13px]"
          />
        </div>
      </div>

      <div>
        <label className="label-field" htmlFor="m-key">
          {t.models.apiKey} {existing && <span className="text-violet-100/42">{t.models.leaveBlank}</span>}
        </label>
        <input
          id="m-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="input-field font-mono text-[13px]"
          required={!existing}
        />
      </div>

      {scope === 'workspace' && isAdmin && (
        <label className="flex items-center gap-2 text-[13px] text-violet-100/70">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded border-white/20 bg-white/10 accent-fuchsia-400"
          />
          {t.models.workspaceDefault}
        </label>
      )}

      {error && <div className="alert-error">{error}</div>}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t.common.saving : existing ? t.common.saveChanges : t.models.addModel}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
