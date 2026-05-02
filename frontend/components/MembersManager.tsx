'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  advisor_of: string[];
  created_at: string;
}

interface MembersManagerProps {
  workspaceId: string;
  currentRole: string;
  isTeam: boolean;
}

function memberName(member: Member) {
  return member.display_name || member.email.split('@')[0];
}

export default function MembersManager({ workspaceId, currentRole, isTeam }: MembersManagerProps) {
  const { t } = useLanguage();
  const isAdmin = currentRole === 'admin' || currentRole === 'self' || currentRole === 'global_admin';
  const roleLabels: Record<string, string> = {
    self: t.roles.self,
    admin: t.roles.admin,
    advisor: t.roles.advisor,
    student: t.roles.student,
    global_admin: t.roles.globalAdmin,
  };
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<Member[]>(`/api/workspaces/${workspaceId}/members`);
      setMembers(res.data);
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

  const remove = async (uid: string) => {
    if (!confirm(t.members.removeConfirm)) return;
    try {
      await api.delete(`/api/workspaces/${workspaceId}/members/${uid}`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    }
  };

  const students = members.filter((m) => m.role === 'student');

  if (!isTeam) {
    return (
      <section className="surface px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 text-fuchsia-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
          </svg>
        </div>
        <h3 className="mb-2 text-[15px] font-semibold tracking-[-0.01em] text-white">
          {t.members.personalTitle}
        </h3>
        <p className="mx-auto max-w-sm text-[13px] text-violet-100/62">
          {t.members.personalBody}
        </p>
      </section>
    );
  }

  return (
    <section>
      {error && <div className="alert-error mb-5">{error}</div>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-violet-100/62">
          {members.length} {t.members.member}{t.common.languageShort === 'EN' && members.length === 1 ? '' : t.common.languageShort === 'EN' ? 's' : ''}.
          {isAdmin && ` ${t.members.addExisting}`}
        </p>
        {isAdmin && !showAdd && !editing && (
          <button onClick={() => setShowAdd(true)} className="btn-secondary self-start sm:self-auto">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t.members.addMember}
          </button>
        )}
      </div>

      {showAdd && (
        <MemberForm
          workspaceId={workspaceId}
          existing={null}
          students={students}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {editing && (
        <MemberForm
          workspaceId={workspaceId}
          existing={editing}
          students={students.filter((s) => s.user_id !== editing.user_id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {loaded && (
        <ul className="surface divide-y divide-white/10 overflow-hidden">
          {members.map((m) => {
            const advisorOfNames = m.advisor_of
              .map((id) => members.find((x) => x.user_id === id))
              .filter(Boolean)
              .map((x) => memberName(x!));
            return (
              <li key={m.user_id} className="flex flex-col gap-3 px-5 py-4 transition-all hover:bg-white/10 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-cyan-300 text-[13px] font-semibold text-white shadow-[0_14px_34px_-20px_rgba(217,70,239,1)]">
                    {memberName(m).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-white">
                        {memberName(m)}
                      </span>
                      <span className="pill border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                        {roleLabels[m.role] ?? m.role}
                      </span>
                    </div>
                    <div className="truncate text-[12px] text-violet-100/55">{m.email}</div>
                    {m.role === 'advisor' && advisorOfNames.length > 0 && (
                      <div className="mt-1 text-[11px] text-violet-100/45">
                        {t.members.supervises} {advisorOfNames.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                {isAdmin && m.role !== 'self' && (
                  <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                    <button onClick={() => setEditing(m)} className="btn-ghost">
                      {t.common.edit}
                    </button>
                    <button onClick={() => remove(m.user_id)} className="btn-ghost text-red-100/70 hover:text-red-100">
                      {t.common.remove}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface MemberFormProps {
  workspaceId: string;
  existing: Member | null;
  students: Member[];
  onClose: () => void;
  onSaved: () => void;
}

function MemberForm({ workspaceId, existing, students, onClose, onSaved }: MemberFormProps) {
  const { t } = useLanguage();
  const roleLabels: Record<'admin' | 'advisor' | 'student', string> = {
    admin: t.roles.admin,
    advisor: t.roles.advisor,
    student: t.roles.student,
  };
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<'admin' | 'advisor' | 'student'>((existing?.role as any) ?? 'student');
  const [advisorOf, setAdvisorOf] = useState<string[]>(existing?.advisor_of ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleStudent = (sid: string) => {
    setAdvisorOf((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await api.patch(`/api/workspaces/${workspaceId}/members/${existing.user_id}`, {
          role,
          advisor_of: role === 'advisor' ? advisorOf : [],
        });
      } else {
        await api.post(`/api/workspaces/${workspaceId}/members`, {
          email,
          role,
          advisor_of: role === 'advisor' ? advisorOf : [],
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
        {existing ? `${t.members.editMember} ${existing.display_name || existing.email}` : t.members.addMember}
      </h3>

      {!existing && (
        <div>
          <label className="label-field" htmlFor="m-email">{t.members.email}</label>
          <input
            id="m-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={t.members.placeholderEmail}
            className="input-field"
          />
          <p className="mt-1.5 text-[11px] text-violet-100/42">
            {t.members.registeredOnly}
          </p>
        </div>
      )}

      <div>
        <label className="label-field">{t.members.role}</label>
        <div className="grid grid-cols-3 gap-2">
          {(['admin', 'advisor', 'student'] as const).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRole(r)}
              className={`h-10 rounded-full border px-3 text-[13px] font-semibold transition-all ${
                role === r
                  ? 'border-fuchsia-300/45 bg-gradient-to-r from-violet-500/35 to-fuchsia-500/35 text-white shadow-[0_12px_32px_-22px_rgba(217,70,239,1)]'
                  : 'border-white/12 bg-white/[0.05] text-violet-100/65 hover:border-white/25 hover:bg-white/10 hover:text-white'
              }`}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {role === 'advisor' && (
        <div>
          <label className="label-field">{t.members.supervises}</label>
          {students.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-violet-100/52">
              {t.members.addStudentsFirst}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {students.map((s) => {
                const active = advisorOf.includes(s.user_id);
                return (
                  <button
                    type="button"
                    key={s.user_id}
                    onClick={() => toggleStudent(s.user_id)}
                    className={`pill cursor-pointer transition-all ${
                      active
                        ? 'border-fuchsia-300/45 bg-gradient-to-r from-violet-500/35 to-fuchsia-500/35 text-white'
                        : 'hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {memberName(s)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t.common.saving : existing ? t.common.saveChanges : t.members.addMember}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
