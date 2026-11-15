import { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudCog, HardDrive, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  STORAGE_MODES,
  STORAGE_MODE_LABELS,
  STORAGE_SECRET_KEEP,
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
        description="配置上传图片的存储方式；切换存储模式后新上传的图片立即使用新配置"
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
    </div>
  );
}
