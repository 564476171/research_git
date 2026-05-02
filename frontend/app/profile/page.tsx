'use client';

import { useEffect, useState } from 'react';

import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import PersonalModelsPanel from '@/components/PersonalModelsPanel';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [institution, setInstitution] = useState(user?.institution ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(user?.website_url ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
    setInstitution(user?.institution ?? '');
    setWebsiteUrl(user?.website_url ?? '');
    setBio(user?.bio ?? '');
  }, [user?.bio, user?.display_name, user?.institution, user?.website_url]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.patch('/api/me', {
        display_name: displayName.trim() || null,
        institution: institution.trim() || null,
        website_url: websiteUrl.trim() || null,
        bio: bio.trim() || null,
      });
      setUser(res.data);
      setMessage(t.profile.saved);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('avatar', avatarFile);
      const res = await api.post('/api/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
      setAvatarFile(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.delete('/api/me/avatar');
      setUser(res.data);
      setAvatarFile(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="pill">{t.common.account}</span>
                {user?.is_global_admin && <span className="pill-dark">{t.roles.globalAdmin}</span>}
              </div>
              <h1 className="gradient-text truncate text-[36px] font-semibold leading-tight tracking-[-0.05em] sm:text-[52px]">
                {user?.display_name || user?.email || t.profile.title}
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-violet-100/65">
                {t.profile.subtitle}
              </p>
            </div>
          </div>
        </header>

        {(error || message) && (
          <div className={error ? 'alert-error' : 'surface px-4 py-3 text-[13px] text-violet-100/75'}>
            {error || message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={onSave} className="surface space-y-5 p-5 sm:p-6">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-white">{t.profile.personalInfo}</h2>
              <p className="mt-2 text-[13px] leading-6 text-violet-100/62">{t.profile.personalInfoHelp}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label-field" htmlFor="display-name">{t.profile.displayName}</label>
                <input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field" htmlFor="institution">{t.profile.institution}</label>
                <input
                  id="institution"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <label className="label-field" htmlFor="website">{t.profile.website}</label>
              <input
                id="website"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="input-field"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="label-field" htmlFor="bio">{t.profile.bio}</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="textarea-field"
                rows={6}
              />
            </div>

            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t.common.saving : t.common.saveChanges}
            </button>
          </form>

          <aside className="surface h-fit space-y-5 p-5 sm:p-6">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-white">{t.profile.avatar}</h2>
              <p className="mt-2 text-[13px] leading-6 text-violet-100/62">{t.profile.avatarHelp}</p>
            </div>
            <div className="flex items-center gap-4">
              <Avatar src={user?.avatar_url} name={user?.display_name} email={user?.email} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">{user?.display_name || user?.email}</div>
                <div className="truncate text-[12px] text-violet-100/50">{user?.email}</div>
              </div>
            </div>
            <div>
              <label className="label-field" htmlFor="avatar-file">{t.common.chooseFile}</label>
              <input
                id="avatar-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                className="input-field py-2"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={uploadAvatar} disabled={!avatarFile || uploading} className="btn-secondary">
                {uploading ? t.common.uploading : t.common.upload}
              </button>
              {user?.avatar_url && (
                <button type="button" onClick={removeAvatar} disabled={uploading} className="btn-ghost text-red-100/70 hover:text-red-100">
                  {t.profile.removeAvatar}
                </button>
              )}
            </div>
          </aside>
        </div>

        <PersonalModelsPanel />
      </div>
    </AppShell>
  );
}
