import { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  CloudCog,
  HardDrive,
  HeartHandshake,
  Loader2,
  Mail,
  MessageSquare,
  Save,
  SendHorizonal,
  ShieldCheck,
  UserRoundPlus,
  Globe,
} from 'lucide-react';
import {
  MAIL_SECRET_KEEP,
  QQ_BOT_DEFAULT_DAILY_REPORT_TIME,
  QQ_BOT_SECRET_KEEP,
  STORAGE_MODES,
  STORAGE_MODE_LABELS,
  STORAGE_SECRET_KEEP,
  type MailSettings,
  type QQBotNotifySettings,
  type QQBotSettings,
  type QQBotTestType,
  type RegistrationSettings,
  type SiteSettings,
  type StorageMode,
  type StorageSettings,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Field, Input, Select, Textarea } from '../../components/Field';
import ImageUploader from '../../components/ImageUploader';
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
        description="配置站点信息、存储方式、注册流程与邮件发送参数；保存后即时生效"
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
      <SiteSettingsCard />
      <RegistrationSettingsCard />
      <MailSettingsCard />
      <QQBotSettingsCard />
    </div>
  );
}

const EMAIL_PATTERN_SITE = /^\S+@\S+\.\S+$/;

interface SiteForm {
  icpNumber: string;
  contactEmail: string;
  sponsorNote: string;
  sponsorQrcodeUrl: string | null;
}

const EMPTY_SITE: SiteForm = { icpNumber: '', contactEmail: '', sponsorNote: '', sponsorQrcodeUrl: null };

// 站点信息：About 页展示的备案号、联系邮箱与赞助支持（赞赏码），留空不展示
function SiteSettingsCard() {
  const toast = useToast();
  const [form, setForm] = useState<SiteForm>(EMPTY_SITE);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<{ item: SiteSettings }>('/api/admin/settings/site');
      const item = res.item;
      setForm({
        icpNumber: item.icpNumber ?? '',
        contactEmail: item.contactEmail ?? '',
        sponsorNote: item.sponsorNote ?? '',
        sponsorQrcodeUrl: item.sponsorQrcodeUrl ?? null,
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
    if (form.contactEmail.trim() && !EMAIL_PATTERN_SITE.test(form.contactEmail.trim())) {
      next['contactEmail'] = '联系邮箱格式不正确';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    try {
      await api.put<{ item: SiteSettings }>('/api/admin/settings/site', {
        icpNumber: form.icpNumber.trim(),
        contactEmail: form.contactEmail.trim(),
        sponsorNote: form.sponsorNote.trim(),
        sponsorQrcodeUrl: form.sponsorQrcodeUrl,
      });
      toast.success('站点信息已保存并生效');
      void fetchSettings();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }, [saving, validate, form, toast, fetchSettings]);

  const errorOf = (key: string) => errors[key];

  if (loading) {
    return (
      <Card className="flex items-center justify-center px-4 py-10 text-sm text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 站点信息加载中…
      </Card>
    );
  }
  if (failed) {
    return (
      <Card className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-muted">
        站点信息加载失败
        <Button variant="ghost" size="sm" onClick={() => void fetchSettings()}>
          重试
        </Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <Globe className="h-4 w-4 text-amber" />
        站点信息
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ICP 备案号" hint="例如 粤ICP备XXXXXXXX号；留空则 About 页不展示备案链接">
          <Input
            value={form.icpNumber}
            maxLength={60}
            onChange={(event) => setForm({ ...form, icpNumber: event.target.value })}
            placeholder="粤ICP备2024000000号"
          />
        </Field>
        <Field label="联系邮箱" error={errorOf('contactEmail')} hint="展示在 About 页「加入维护」板块；留空不展示">
          <Input
            value={form.contactEmail}
            maxLength={200}
            onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
            placeholder="admin@example.com"
          />
        </Field>
      </div>
      <Field label="赞助说明" hint="展示在 About 页「赞助支持」板块，最多 200 字；留空不展示该板块">
        <Textarea
          rows={3}
          value={form.sponsorNote}
          maxLength={200}
          onChange={(event) => setForm({ ...form, sponsorNote: event.target.value })}
          placeholder="例如：服务器与域名维护需要成本，若本站对你有帮助，欢迎请站长喝杯奶茶～"
        />
      </Field>
      <Field label="赞赏码" hint="上传后在 About 页「赞助支持」板块展示，访客可点击放大">
        <div className="w-44">
          <ImageUploader
            variant="square"
            label=""
            hint=""
            value={form.sponsorQrcodeUrl}
            onChange={(url) => setForm({ ...form, sponsorQrcodeUrl: url })}
          />
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

interface QQBotForm {
  appId: string;
  appSecret: string;
  groupOpenId: string;
  channelId: string;
  enabled: boolean;
  notify: QQBotNotifySettings;
  dailyReportTime: string;
}

const EMPTY_QQ_BOT: QQBotForm = {
  appId: '',
  appSecret: '',
  groupOpenId: '',
  channelId: '',
  enabled: false,
  notify: { submission: true, report: true, dailyReport: true },
  dailyReportTime: QQ_BOT_DEFAULT_DAILY_REPORT_TIME,
};

// 可分类型开关的推送事件
const QQ_BOT_NOTIFY_TYPES: {
  key: keyof QQBotNotifySettings;
  testType: QQBotTestType;
  label: string;
  hint: string;
}[] = [
  { key: 'submission', testType: 'submission', label: '投稿提醒', hint: '用户新增/修改投稿时推送' },
  { key: 'report', testType: 'report', label: '举报提醒', hint: '收到评论举报时推送' },
  { key: 'dailyReport', testType: 'daily', label: '数据日报', hint: '每天定时推送前一天的数据汇总' },
];

interface QQBotTestResult {
  ok: boolean;
  sent: string[];
  error?: string;
}

// webhook 捕获的群（机器人被拉入群后自动记录）
interface QQBotBoundGroupItem {
  groupOpenId: string;
  name: string | null;
  source: string;
  lastSeenAt: string;
}

interface QQBotGuildOption {
  id: string;
  name: string;
}

interface QQBotChannelOption {
  id: string;
  name: string;
}

interface QQBotGuildListResult {
  ok: boolean;
  guilds: QQBotGuildOption[];
  error?: string;
}

interface QQBotChannelListResult {
  ok: boolean;
  channels: QQBotChannelOption[];
  error?: string;
}

// QQ 机器人提醒设置：用户投稿后通过 QQ 官方机器人（api-v2）推送审核提醒
function QQBotSettingsCard() {
  const toast = useToast();
  const [form, setForm] = useState<QQBotForm>(EMPTY_QQ_BOT);
  const [hasAppSecret, setHasAppSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingType, setTestingType] = useState<QQBotTestType | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 频道选择器状态
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guilds, setGuilds] = useState<QQBotGuildOption[]>([]);
  const [guildId, setGuildId] = useState('');
  const [channels, setChannels] = useState<QQBotChannelOption[]>([]);
  const [channelPick, setChannelPick] = useState('');
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [pickerError, setPickerError] = useState('');
  // webhook 捕获的群列表
  const [boundGroups, setBoundGroups] = useState<QQBotBoundGroupItem[]>([]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<{ item: QQBotSettings }>('/api/admin/settings/qq-bot');
      const item = res.item;
      setHasAppSecret(item.appSecret === QQ_BOT_SECRET_KEEP);
      setForm({
        appId: item.appId,
        appSecret: item.appSecret === QQ_BOT_SECRET_KEEP ? '' : item.appSecret,
        groupOpenId: item.groupOpenId ?? '',
        channelId: item.channelId ?? '',
        enabled: item.enabled,
        notify: item.notify ?? EMPTY_QQ_BOT.notify,
        dailyReportTime: item.dailyReportTime ?? QQ_BOT_DEFAULT_DAILY_REPORT_TIME,
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 捕获群列表加载失败不阻塞设置编辑，仅静默忽略
  const fetchBoundGroups = useCallback(async () => {
    try {
      const res = await api.get<{ items: QQBotBoundGroupItem[] }>('/api/admin/settings/qq-bot/groups');
      setBoundGroups(res.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchBoundGroups();
  }, [fetchSettings, fetchBoundGroups]);

  // 打开/关闭频道选择面板；打开时拉取机器人所在频道列表
  const toggleGuildPicker = useCallback(() => {
    const next = !pickerOpen;
    setPickerOpen(next);
    if (!next) return;
    setPickerError('');
    setLoadingGuilds(true);
    api
      .get<QQBotGuildListResult>('/api/admin/settings/qq-bot/guilds')
      .then((res) => {
        if (res.ok) {
          setGuilds(res.guilds);
        } else {
          setPickerError(res.error ?? '频道列表获取失败');
        }
      })
      .catch((error) => {
        setPickerError(error instanceof ApiError ? error.message : '频道列表获取失败');
      })
      .finally(() => setLoadingGuilds(false));
  }, [pickerOpen]);

  // 选择频道后联动拉取其文字子频道列表
  const onPickGuild = useCallback((value: string) => {
    setGuildId(value);
    setChannels([]);
    setChannelPick('');
    setPickerError('');
    if (!value) return;
    setLoadingChannels(true);
    api
      .get<QQBotChannelListResult>(`/api/admin/settings/qq-bot/guilds/${encodeURIComponent(value)}/channels`)
      .then((res) => {
        if (res.ok) {
          setChannels(res.channels);
        } else {
          setPickerError(res.error ?? '子频道列表获取失败');
        }
      })
      .catch((error) => {
        setPickerError(error instanceof ApiError ? error.message : '子频道列表获取失败');
      })
      .finally(() => setLoadingChannels(false));
  }, []);

  const confirmChannel = useCallback(() => {
    if (!channelPick) return;
    setForm({ ...form, channelId: channelPick });
    setPickerOpen(false);
  }, [channelPick, form]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!form.appId.trim()) next['appId'] = 'AppID 不能为空';
    if (!form.appSecret.trim() && !hasAppSecret) next['appSecret'] = 'AppSecret 不能为空';
    if (form.enabled && !form.groupOpenId.trim() && !form.channelId.trim()) {
      next['targets'] = '启用提醒前请填写群 OpenID 或频道子频道 ID';
    }
    if (form.enabled && form.notify.dailyReport && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.dailyReportTime.trim())) {
      next['dailyReportTime'] = '日报时间格式应为 HH:mm';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, hasAppSecret]);

  /** 保存当前表单；返回是否保存成功（测试发送前先保存） */
  const save = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;
    setSaving(true);
    try {
      await api.put<{ item: QQBotSettings }>('/api/admin/settings/qq-bot', {
        // AppSecret 留空且已配置过时传哨兵值，表示保留现有密钥
        appId: form.appId.trim(),
        appSecret: form.appSecret.trim() ? form.appSecret.trim() : hasAppSecret ? QQ_BOT_SECRET_KEEP : '',
        groupOpenId: form.groupOpenId.trim() || null,
        channelId: form.channelId.trim() || null,
        enabled: form.enabled,
        notify: form.notify,
        dailyReportTime: form.dailyReportTime.trim() || QQ_BOT_DEFAULT_DAILY_REPORT_TIME,
      });
      toast.success('QQ 机器人设置已保存并生效');
      void fetchSettings();
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
      return false;
    } finally {
      setSaving(false);
    }
  }, [validate, form, hasAppSecret, toast, fetchSettings]);

  // 测试推送前先保存，保证用后台最新配置发送
  const sendTest = useCallback(async (type: QQBotTestType = 'general') => {
    if (testingType) return;
    const saved = await save();
    if (!saved) return;
    setTestingType(type);
    try {
      const res = await api.post<QQBotTestResult>('/api/admin/settings/qq-bot/test', { type });
      if (res.ok) {
        toast.success(`测试消息已发送：${res.sent.join('、')}`);
      } else {
        toast.error(res.error ?? '测试消息发送失败');
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '测试发送失败，请稍后再试');
    } finally {
      setTestingType(null);
    }
  }, [testingType, save, toast]);

  const errorOf = (key: string) => errors[key];

  if (loading) {
    return (
      <Card className="flex items-center justify-center px-4 py-10 text-sm text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> QQ 机器人设置加载中…
      </Card>
    );
  }
  if (failed) {
    return (
      <Card className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-muted">
        QQ 机器人设置加载失败
        <Button variant="ghost" size="sm" onClick={() => void fetchSettings()}>
          重试
        </Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <MessageSquare className="h-4 w-4 text-amber" />
        QQ 机器人提醒
      </p>
      <Field label="投稿提醒开关" hint="开启后，用户提交/重新提交投稿时机器人会向你配置的群或频道推送审核提醒">
        <div className="grid gap-3 sm:grid-cols-2">
          {([true, false] as const).map((value) => {
            const active = form.enabled === value;
            return (
              <button
                key={String(value)}
                type="button"
                onClick={() => setForm({ ...form, enabled: value })}
                className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-3.5 text-left transition ${
                  active ? 'border-amber/70 bg-amber/10' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                }`}
              >
                <span className="flex w-full items-center gap-2 text-sm font-extrabold text-ink">
                  <SendHorizonal className={`h-4 w-4 ${active ? 'text-amber' : 'text-muted'}`} />
                  {value ? '开启提醒' : '关闭提醒'}
                </span>
                <span className="text-[11px] leading-snug text-muted">
                  {value ? '每条新投稿都会推送一条文本提醒' : '投稿仍会进入审核队列，但不推送机器人消息'}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field
        label="推送类型"
        hint="分别控制哪类事件推送机器人消息；总开关关闭时不推送任何消息"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {QQ_BOT_NOTIFY_TYPES.map((item) => {
            const active = form.notify[item.key];
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => setForm({ ...form, notify: { ...form.notify, [item.key]: !active } })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setForm({ ...form, notify: { ...form.notify, [item.key]: !active } });
                  }
                }}
                className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition ${
                  active ? 'border-amber/70 bg-amber/10' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                }`}
              >
                <span className="flex w-full items-center gap-2 text-sm font-extrabold text-ink">
                  <SendHorizonal className={`h-4 w-4 ${active ? 'text-amber' : 'text-muted'}`} />
                  {item.label}
                </span>
                <span className="text-[11px] leading-snug text-muted">{item.hint}</span>
                <span className="flex w-full items-center justify-between">
                  <span className={`text-[11px] font-bold ${active ? 'text-amber' : 'text-muted'}`}>
                    {active ? '已开启' : '已关闭'}
                  </span>
                  <button
                    type="button"
                    title="先保存配置，再发送该类型的测试推送"
                    disabled={testingType !== null || saving}
                    onClick={(event) => {
                      event.stopPropagation();
                      void sendTest(item.testType);
                    }}
                    className="rounded-lg border border-white/10 px-2 py-0.5 text-[11px] text-muted transition hover:border-amber/60 hover:text-amber disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testingType === item.testType ? '发送中…' : '测试推送'}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </Field>
      {form.notify.dailyReport && (
        <Field
          label="日报发送时间"
          error={errorOf('dailyReportTime')}
          hint="每日数据日报的发送时间（北京时间），默认 10:00；修改保存后立即生效"
        >
          <Input
            type="time"
            value={form.dailyReportTime}
            onChange={(event) => setForm({ ...form, dailyReportTime: event.target.value })}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="AppID" required error={errorOf('appId')} hint="QQ 开放平台机器人管理端的 AppID">
          <Input
            value={form.appId}
            maxLength={64}
            onChange={(event) => setForm({ ...form, appId: event.target.value })}
            placeholder="例如 102xxxxxx"
          />
        </Field>
        <Field label="AppSecret" required error={errorOf('appSecret')}>
          <Input
            type="password"
            value={form.appSecret}
            onChange={(event) => setForm({ ...form, appSecret: event.target.value })}
            placeholder={hasAppSecret ? SECRET_PLACEHOLDER : '机器人管理端的 AppSecret'}
          />
        </Field>
        <Field
          label="群 OpenID"
          error={errorOf('targets')}
          hint="群聊场景推送目标：可手动填写，或从下方已捕获的群中选择"
        >
          <Input
            value={form.groupOpenId}
            maxLength={64}
            onChange={(event) => setForm({ ...form, groupOpenId: event.target.value })}
            placeholder="例如 5D6xxxxxxxxxxxxxxxx"
          />
          {boundGroups.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boundGroups.map((group) => {
                const active = form.groupOpenId === group.groupOpenId;
                return (
                  <button
                    key={group.groupOpenId}
                    type="button"
                    title={group.groupOpenId}
                    onClick={() => setForm({ ...form, groupOpenId: group.groupOpenId })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      active
                        ? 'border-amber/70 bg-amber/10 text-ink'
                        : 'border-white/10 bg-white/[0.04] text-muted hover:border-white/25 hover:text-ink'
                    }`}
                  >
                    {group.name ?? '未命名群'}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted/80">
              暂无已捕获的群：在开放平台配置回调地址后，机器人被拉入群会自动出现在这里
            </p>
          )}
        </Field>
        <Field label="频道子频道 ID" hint="频道场景推送目标（文字子频道 channel_id），与群 OpenID 至少填一个">
          <div className="flex items-center gap-2">
            <Input
              value={form.channelId}
              maxLength={64}
              onChange={(event) => setForm({ ...form, channelId: event.target.value })}
              placeholder="例如 123456"
            />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              loading={loadingGuilds}
              onClick={toggleGuildPicker}
            >
              从频道选择
            </Button>
          </div>
          {pickerOpen ? (
            <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <Select value={guildId} onChange={(event) => onPickGuild(event.target.value)}>
                <option value="">选择机器人所在频道</option>
                {guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name || guild.id}
                  </option>
                ))}
              </Select>
              <Select
                value={channelPick}
                disabled={!guildId || loadingChannels}
                onChange={(event) => setChannelPick(event.target.value)}
              >
                <option value="">
                  {guildId ? (loadingChannels ? '子频道加载中…' : '选择文字子频道') : '请先选择频道'}
                </option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name || channel.id}
                  </option>
                ))}
              </Select>
              {pickerError ? <p className="text-xs text-coral">{pickerError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                  取消
                </Button>
                <Button variant="primary" size="sm" disabled={!channelPick} onClick={confirmChannel}>
                  填入
                </Button>
              </div>
            </div>
          ) : null}
        </Field>
      </div>
      <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-muted">
        <p>
          通过 QQ 官方开放平台 API v2（api.bot.qq.com）发送主动消息：群主动消息受平台频控（未开启「机器人主动发言」的群会发送失败），频道发送要求机器人保持 WebSocket 在线。提醒为 best-effort，失败仅记录日志，不影响投稿提交。
        </p>
        <p>
          群自动捕获：在开放平台「开发设置」将回调地址配置为 <span className="text-ink">https://&lt;你的域名&gt;/api/qq-bot/webhook</span>
          （需先在上方保存 AppSecret，平台验证请求才能通过），并订阅 GROUP_ADD_ROBOT / GROUP_DEL_ROBOT / GROUP_AT_MESSAGE_CREATE
          事件，机器人被拉入的群会自动出现在上方供选择。
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={testingType !== null || saving}
          icon={
            testingType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />
          }
          onClick={() => void sendTest()}
        >
          {testingType ? '发送中…' : '测试推送'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={saving || testingType !== null}
          icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </Card>
  );
}
