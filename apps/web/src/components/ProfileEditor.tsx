import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { spaceHref } from '@spaceport/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Button from './Button';
import Card from './Card';
import ImageUploader from './ImageUploader';
import { inputClass, Field } from './Field';
import CityPicker from './forms/CityPicker';
import { useToast } from './Toast';

// 个人资料编辑：昵称、头像、自我介绍、地区，保存后同步全局登录态。
export default function ProfileEditor() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState({ province: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname);
    setAvatarUrl(user.avatarUrl ?? null);
    setBio(user.bio ?? '');
    setLocation({ province: user.province ?? '', city: user.city ?? '' });
  }, [user?.id]);

  if (!user) return null;

  const handleSave = async () => {
    if (saving) return;
    if (!nickname.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/api/users/me', {
        nickname: nickname.trim(),
        avatarUrl,
        bio: bio.trim(),
        province: location.province || null,
        city: location.city || null,
      });
      await refresh();
      toast.success('个人资料已更新');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card hover={false} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">个人资料</h2>
          <p className="mt-1 text-xs text-muted">
            昵称、头像与自我介绍会展示在你的
            {user.uid != null ? (
              <a href={spaceHref(user.uid)} className="mx-0.5 text-amber underline-offset-2 hover:underline">
                个人空间
              </a>
            ) : (
              '个人空间'
            )}
            ，你上传的内容也会在空间中呈现。
          </p>
        </div>
        <Button size="sm" onClick={() => void handleSave()} loading={saving} icon={saved ? <Check className="h-3.5 w-3.5" /> : undefined}>
          {saved ? '已保存' : '保存资料'}
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row">
        <div className="shrink-0">
          <ImageUploader
            value={avatarUrl}
            onChange={(url) => setAvatarUrl(url)}
            variant="square"
            label="上传头像"
            hint="支持 JPG/PNG/WebP，建议 1:1"
          />
        </div>

        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Field label="昵称" htmlFor="profile-nickname">
            <input
              id="profile-nickname"
              className={inputClass}
              value={nickname}
              maxLength={20}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="怎么称呼你"
            />
          </Field>
          <Field label="地区（选填）">
            <CityPicker value={location} onChange={setLocation} />
          </Field>
          <Field label="自我介绍" htmlFor="profile-bio" className="sm:col-span-2">
            <textarea
              id="profile-bio"
              className={`${inputClass} min-h-[76px] resize-y`}
              value={bio}
              maxLength={200}
              onChange={(event) => setBio(event.target.value)}
              placeholder="向大家介绍一下你和 ChiliChill 的故事（200 字以内）"
            />
            <p className="mt-1 text-right text-[11px] text-muted/70">{bio.length}/200</p>
          </Field>
        </div>
      </div>
    </Card>
  );
}
