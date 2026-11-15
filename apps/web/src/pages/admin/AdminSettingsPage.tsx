import { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudCog, HardDrive, Loader2, Mail, Save, ShieldCheck, UserRoundPlus } from 'lucide-react';
import {
  MAIL_SECRET_KEEP,
  STORAGE_MODES,
  STORAGE_MODE_LABELS,
  STORAGE_SECRET_KEEP,
  type MailSettings,
  type RegistrationSettings,
  type StorageMode,
  type StorageSettings,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Field, Input } from '../../components/Field';
import SectionHeading from '../../components/SectionHeading';
import { useToast } from '../../components/Toast';

const MODE_META: Record<StorageMode, { icon: typeof HardDrive; hint: string }> = {
  local: { icon: HardDrive, hint: '图片保存在服务器本地磁盘，适合小型部署，无需额外配置' },
  cos: { icon: Cloud, hint: '上传至腾讯云对象存储 COS，适合大流量图床场景' },
  oss: { icon: CloudCog, hint: '上传至阿里云对象存储 OSS，适合大流量图床场景' },
};

interface CosForm {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  baseUrl: string;
}

interface OssForm {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  baseUrl: string;
}

const EMPTY_COS: CosForm = { secretId: '', secretKey: '', bucket: '', region: '', baseUrl: '' };
const EMPTY_OSS: OssForm = {
  accessKeyId: '',
  accessKeySecret: '',
  bucket: '',
  region: '',
  endpoint: '',
  baseUrl: '',
};

const SECRET_PLACEHOLDER = '已配置，留空表示保留现有密钥';

// 系统设置：存储模式切换与云存储参数配置，保存后即时生效
export default function AdminSettingsPage() {
  const toast = useToast();
  const [mode, setMode] = useState<StorageMode>('local');
  const [cos, setCos] = useState<CosForm>(EMPTY_COS);
  const [oss, setOss] = useState<OssForm>(EMPTY_OSS);
  const [hasCosSecret, setHasCosSecret] = useState(false);
  const [hasOssSecret, setHasOssSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<{ item: StorageSettings }>('/api/admin/settings/storage');
      const item = res.item;
      setMode(item.mode);
      setHasCosSecret(Boolean(item.cos?.secretId && item.cos.secretKey));
      setHasOssSecret(Boolean(item.oss?.accessKeyId && item.oss.accessKeySecret));
      if (item.cos) {
        setCos({
          secretId: item.cos.secretId === STORAGE_SECRET_KEEP ? '' : item.cos.secretId,
          secretKey: item.cos.secretKey === STORAGE_SECRET_KEEP ? '' : item.cos.secretKey,
          bucket: item.cos.bucket,
          region: item.cos.region,
          baseUrl: item.cos.baseUrl ?? '',
        });
      }
      if (item.oss) {
        setOss({
          accessKeyId: item.oss.accessKeyId === STORAGE_SECRET_KEEP ? '' : item.oss.accessKeyId,
          accessKeySecret: item.oss.accessKeySecret === STORAGE_SECRET_KEEP ? '' : item.oss.accessKeySecret,
          bucket: item.oss.bucket,
          region: item.oss.region,
          endpoint: item.oss.endpoint ?? '',
          baseUrl: item.oss.baseUrl ?? '',
        });
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (mode === 'cos') {
      if (!cos.secretId.trim() && !hasCosSecret) next['cos.secretId'] = 'SecretId 不能为空';
      if (!cos.secretKey.trim() && !hasCosSecret) next['cos.secretKey'] = 'SecretKey 不能为空';
      if (!cos.bucket.trim()) next['cos.bucket'] = 'Bucket 不能为空';
      if (!cos.region.trim()) next['cos.region'] = '地域不能为空，例如 ap-guangzhou';
    }
    if (mode === 'oss') {
      if (!oss.accessKeyId.trim() && !hasOssSecret) next['oss.accessKeyId'] = 'AccessKeyId 不能为空';
      if (!oss.accessKeySecret.trim() && !hasOssSecret) next['oss.accessKeySecret'] = 'AccessKeySecret 不能为空';
      if (!oss.bucket.trim()) next['oss.bucket'] = 'Bucket 不能为空';
      if (!oss.region.trim()) next['oss.region'] = '地域不能为空，例如 oss-cn-hangzhou 或 cn-hangzhou';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [mode, cos, oss, hasCosSecret, hasOssSecret]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const secretOf = (value: string, exists: boolean) =>
        value.trim() ? value.trim() : exists ? STORAGE_SECRET_KEEP : '';
      await api.put<{ item: StorageSettings }>('/api/admin/settings/storage', {
        mode,
        cos:
          mode === 'cos'
            ? {
                secretId: secretOf(cos.secretId, hasCosSecret),
                secretKey: secretOf(cos.secretKey, hasCosSecret),
                bucket: cos.bucket.trim(),
                region: cos.region.trim(),
                baseUrl: cos.baseUrl.trim() || null,
              }
            : null,
        oss:
          mode === 'oss'
            ? {
                accessKeyId: secretOf(oss.accessKeyId, hasOssSecret),
                accessKeySecret: secretOf(oss.accessKeySecret, hasOssSecret),
                bucket: oss.bucket.trim(),
                region: oss.region.trim(),
                endpoint: oss.endpoint.trim() || null,
                baseUrl: oss.baseUrl.trim() || null,
              }
            : null,
      });
      toast.success('存储配置已保存并生效');
      void fetchSettings();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }, [saving, validate, mode, cos, oss, hasCosSecret, hasOssSecret, toast, fetchSettings]);

  const errorOf = (key: string) => errors[key];

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Settings"
        title="系统设置"
        description="配置上传图片的存储方式、注册流程与邮件发送参数；保存后即时生效"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchSettings()}
            disabled={loading}
          >
            刷新
          </Button>
        }
      />

      {loading ? (
        <Card className="flex items-center justify-center px-4 py-16 text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
        </Card>
      ) : failed ? (
        <Card className="px-4 py-16 text-center text-sm text-muted">
          设置加载失败，请点击「刷新」重试
        </Card>
      ) : (
        <Card className="space-y-6 p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <HardDrive className="h-4 w-4 text-amber" />
            存储设置
          </p>
          <Field label="存储模式" hint="切换后立即生效，已有图片链接不受影响">
            <div className="grid gap-3 sm:grid-cols-3">
              {STORAGE_MODES.map((value) => {
                const meta = MODE_META[value];
                const Icon = meta.icon;
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-3.5 text-left transition ${
                      active
                        ? 'border-amber/70 bg-amber/10'
                        : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                    }`}
                  >
                    <span className="flex w-full items-center gap-2 text-sm font-extrabold text-ink">
                      <Icon className={`h-4 w-4 ${active ? 'text-amber' : 'text-muted'}`} />
                      {STORAGE_MODE_LABELS[value]}
                    </span>
                    <span className="text-[11px] leading-snug text-muted">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {mode === 'cos' ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck className="h-3.5 w-3.5 text-amber" />
                腾讯云 COS 参数
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SecretId" required error={errorOf('cos.secretId')}>
                  <Input
                    value={cos.secretId}
                    onChange={(event) => setCos({ ...cos, secretId: event.target.value })}
                    placeholder={hasCosSecret ? SECRET_PLACEHOLDER : 'AKIDxxxxxxxx'}
                  />
                </Field>
                <Field label="SecretKey" required error={errorOf('cos.secretKey')}>
                  <Input
                    type="password"
                    value={cos.secretKey}
                    onChange={(event) => setCos({ ...cos, secretKey: event.target.value })}
                    placeholder={hasCosSecret ? SECRET_PLACEHOLDER : '请输入 SecretKey'}
                  />
                </Field>
                <Field label="Bucket" required error={errorOf('cos.bucket')}>
                  <Input
                    value={cos.bucket}
                    onChange={(event) => setCos({ ...cos, bucket: event.target.value })}
                    placeholder="例如 chilichill-1250000000"
                  />
                </Field>
                <Field label="地域 Region" required error={errorOf('cos.region')}>
                  <Input
                    value={cos.region}
                    onChange={(event) => setCos({ ...cos, region: event.target.value })}
                    placeholder="例如 ap-guangzhou"
                  />
                </Field>
                <Field label="自定义访问域名" hint="可选，配置了 CDN 或自定义域名时填写">
                  <Input
                    value={cos.baseUrl}
                    onChange={(event) => setCos({ ...cos, baseUrl: event.target.value })}
                    placeholder="例如 https://img.example.com"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {mode === 'oss' ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck className="h-3.5 w-3.5 text-amber" />
                阿里云 OSS 参数
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="AccessKeyId" required error={errorOf('oss.accessKeyId')}>
                  <Input
                    value={oss.accessKeyId}
                    onChange={(event) => setOss({ ...oss, accessKeyId: event.target.value })}
                    placeholder={hasOssSecret ? SECRET_PLACEHOLDER : 'LTAIxxxxxxxx'}
                  />
                </Field>
                <Field label="AccessKeySecret" required error={errorOf('oss.accessKeySecret')}>
                  <Input
                    type="password"
                    value={oss.accessKeySecret}
                    onChange={(event) => setOss({ ...oss, accessKeySecret: event.target.value })}
                    placeholder={hasOssSecret ? SECRET_PLACEHOLDER : '请输入 AccessKeySecret'}
                  />
                </Field>
                <Field label="Bucket" required error={errorOf('oss.bucket')}>
                  <Input
                    value={oss.bucket}
                    onChange={(event) => setOss({ ...oss, bucket: event.target.value })}
                    placeholder="例如 chilichill"
                  />
                </Field>
                <Field label="地域 Region" required error={errorOf('oss.region')}>
                  <Input
                    value={oss.region}
                    onChange={(event) => setOss({ ...oss, region: event.target.value })}
                    placeholder="例如 cn-hangzhou 或 oss-cn-hangzhou"
                  />
                </Field>
                <Field label="Endpoint" hint="可选，例如 oss-cn-hangzhou.aliyuncs.com">
                  <Input
                    value={oss.endpoint}
                    onChange={(event) => setOss({ ...oss, endpoint: event.target.value })}
                    placeholder="留空则按地域自动推导"
                  />
                </Field>
                <Field label="自定义访问域名" hint="可选，配置了 CDN 或自定义域名时填写">
                  <Input
                    value={oss.baseUrl}
                    onChange={(event) => setOss({ ...oss, baseUrl: event.target.value })}
                    placeholder="例如 https://img.example.com"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {mode === 'local' ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-muted">
              本地存储无需额外参数，图片将保存到服务器的 uploads 目录并通过 /uploads 路径访问。
            </div>
          ) : null}

          <div className="flex items-center justify-end border-t border-white/10 pt-4">
            <Button
              variant="primary"
              size="sm"
              disabled={saving}
              icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </Card>
      )}

      {/* 注册与邮件设置卡片独立加载，与上方存储设置互不影响 */}
      <RegistrationSettingsCard />
      <MailSettingsCard />
    </div>
  );
}

// 注册设置：注册邮箱验证码开关
function RegistrationSettingsCard() {
  const toast = useToast();
  const [emailCodeRequired, setEmailCodeRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<{ item: RegistrationSettings }>('/api/admin/settings/registration');
      setEmailCodeRequired(res.item.emailCodeRequired);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put<{ item: RegistrationSettings }>('/api/admin/settings/registration', {
        emailCodeRequired,
      });
      toast.success('注册设置已保存并生效');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }, [saving, emailCodeRequired, toast]);

  if (loading) {
    return (
      <Card className="flex items-center justify-center px-4 py-10 text-sm text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 注册设置加载中…
      </Card>
    );
  }
  if (failed) {
    return (
      <Card className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-muted">
        注册设置加载失败
        <Button variant="ghost" size="sm" onClick={() => void fetchSettings()}>
          重试
        </Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <UserRoundPlus className="h-4 w-4 text-amber" />
        注册设置
      </p>
      <Field label="注册邮箱验证码" hint="保存后立即生效，注册页会在下次打开时读取最新开关">
        <div className="grid gap-3 sm:grid-cols-2">
          {([true, false] as const).map((value) => {
            const active = emailCodeRequired === value;
            return (
              <button
                key={String(value)}
                type="button"
                onClick={() => setEmailCodeRequired(value)}
                className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-3.5 text-left transition ${
                  active ? 'border-amber/70 bg-amber/10' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                }`}
              >
                <span className="flex w-full items-center gap-2 text-sm font-extrabold text-ink">
                  <ShieldCheck className={`h-4 w-4 ${active ? 'text-amber' : 'text-muted'}`} />
                  {value ? '需要验证码' : '无需验证码'}
                </span>
                <span className="text-[11px] leading-snug text-muted">
                  {value
                    ? '注册前先向邮箱发送 6 位验证码，防止恶意批量注册'
                    : '注册仅凭邮箱与密码，适合未配置邮件服务的部署'}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      <div className="flex items-center justify-end border-t border-white/10 pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </Card>
  );
}

interface MailForm {
  apiKey: string;
  from: string;
  fromName: string;
  replyTo: string;
}

const EMPTY_MAIL: MailForm = { apiKey: '', from: '', fromName: '', replyTo: '' };
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

// 邮件发送设置：数据库优先、环境变量兜底；API Key 保存后即时生效
function MailSettingsCard() {
  const toast = useToast();
  const [form, setForm] = useState<MailForm>(EMPTY_MAIL);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<{ item: MailSettings }>('/api/admin/settings/mail');
      const item = res.item;
      setHasApiKey(item.apiKey === MAIL_SECRET_KEEP);
      setForm({
        apiKey: item.apiKey === MAIL_SECRET_KEEP ? '' : item.apiKey,
        from: item.from,
        fromName: item.fromName,
        replyTo: item.replyTo ?? '',
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!form.apiKey.trim() && !hasApiKey) next['apiKey'] = 'Resend API Key 不能为空';
    if (!form.from.trim()) next['from'] = '发件地址不能为空';
    else if (!EMAIL_PATTERN.test(form.from.trim())) next['from'] = '发件地址必须是纯邮箱地址';
    if (!form.fromName.trim()) next['fromName'] = '发件人名称不能为空';
    if (form.replyTo.trim() && !EMAIL_PATTERN.test(form.replyTo.trim())) {
      next['replyTo'] = '回复地址必须是纯邮箱地址';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, hasApiKey]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    try {
      await api.put<{ item: MailSettings }>('/api/admin/settings/mail', {
        // API Key 留空且已配置过时传哨兵值，表示保留现有密钥
        apiKey: form.apiKey.trim() ? form.apiKey.trim() : hasApiKey ? MAIL_SECRET_KEEP : '',
        from: form.from.trim(),
        fromName: form.fromName.trim(),
        replyTo: form.replyTo.trim() || null,
      });
      toast.success('邮件设置已保存并生效');
      void fetchSettings();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }, [saving, validate, form, hasApiKey, toast, fetchSettings]);

  const errorOf = (key: string) => errors[key];

  if (loading) {
    return (
      <Card className="flex items-center justify-center px-4 py-10 text-sm text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 邮件设置加载中…
      </Card>
    );
  }
  if (failed) {
    return (
      <Card className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-muted">
        邮件设置加载失败
        <Button variant="ghost" size="sm" onClick={() => void fetchSettings()}>
          重试
        </Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <Mail className="h-4 w-4 text-amber" />
        邮件发送设置
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Resend API Key"
          required
          error={errorOf('apiKey')}
          hint={hasApiKey ? undefined : '在 resend.com 的 API Keys 页面创建'}
        >
          <Input
            type="password"
            value={form.apiKey}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            placeholder={hasApiKey ? SECRET_PLACEHOLDER : 're_xxxxxxxx'}
          />
        </Field>
        <Field
          label="发件地址"
          required
          error={errorOf('from')}
          hint="必须是 Resend 已验证域名下的纯邮箱地址，不含显示名"
        >
          <Input
            value={form.from}
            onChange={(event) => setForm({ ...form, from: event.target.value })}
            placeholder="noreply@example.com"
          />
        </Field>
        <Field label="发件人名称" required error={errorOf('fromName')}>
          <Input
            value={form.fromName}
            maxLength={60}
            onChange={(event) => setForm({ ...form, fromName: event.target.value })}
            placeholder="例如 空间站小助手"
          />
        </Field>
        <Field label="回复地址" error={errorOf('replyTo')} hint="可选，用户直接回复邮件时接收地址">
          <Input
            value={form.replyTo}
            onChange={(event) => setForm({ ...form, replyTo: event.target.value })}
            placeholder="support@example.com"
          />
        </Field>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-muted">
        邮件设置保存后立即生效，优先于 .env 中的 RESEND_* 环境变量；后台未配置时仍会回退到环境变量。用于注册验证码、密码重置等系统邮件发送。
      </div>
      <div className="flex items-center justify-end border-t border-white/10 pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </Card>
  );
}
