import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CircleAlert, Orbit, ShieldCheck } from 'lucide-react';
import { api, formatApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import Alert from '../components/Alert';
import Button from '../components/Button';
import Card from '../components/Card';

interface AuthorizeInfo {
  app: {
    clientId: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    homepageUrl: string | null;
  };
  redirectUri: string;
  state: string;
  scope: string;
}

export default function OAuthAuthorizePage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const state = params.get('state') ?? '';
  const scope = params.get('scope') ?? 'basic';

  const [info, setInfo] = useState<AuthorizeInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);

  const paramsReady = Boolean(clientId && redirectUri && state);

  useEffect(() => {
    if (!paramsReady) {
      setError('授权链接不完整，请从接入方网站重新发起登录');
      setLoading(false);
      return;
    }
    let aborted = false;
    setLoading(true);
    api
      .get<AuthorizeInfo>('/api/oauth/authorize', {
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope,
      })
      .then((data) => {
        if (!aborted) setInfo(data);
      })
      .catch((err: unknown) => {
        if (!aborted) setError(formatApiError(err, '授权请求无效'));
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [clientId, redirectUri, state, scope, paramsReady]);

  const handleDecision = async (approve: boolean) => {
    if (!info) return;
    setSubmitting(approve ? 'approve' : 'deny');
    setError('');
    try {
      const result = await api.post<{ redirectUrl: string }>('/api/oauth/authorize/confirm', {
        clientId: info.app.clientId,
        redirectUri: info.redirectUri,
        state: info.state,
        scope: info.scope,
        approve,
      });
      // OAuth 协议重定向：直接跳回第三方回调地址（code/state 或 error 由后端拼好）
      window.location.href = result.redirectUrl;
    } catch (err: unknown) {
      setError(formatApiError(err));
      setSubmitting(null);
    }
  };

  // 登录后回到本授权页：next 需完整携带当前授权参数
  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  if (loading || (authLoading && !error)) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Orbit className="h-8 w-8 animate-spin text-amber" />
          <p className="text-sm">正在校验授权请求…</p>
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-16">
        <Card hover={false} className="p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber/30 bg-amber/10 text-amber">
            <CircleAlert className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-ink">无法继续授权</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{error || '授权请求无效'}</p>
        </Card>
      </div>
    );
  }

  if (!user && !authLoading) {
    return (
      <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-16">
        <Card hover={false} className="p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber/30 bg-amber/10 text-amber">
            <Orbit className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-ink">请先登录空间站通行证</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            登录后即可确认是否授权「{info.app.name}」使用你的空间站通行证。
          </p>
          <Button className="mt-6" fullWidth onClick={() => (window.location.href = loginHref)}>
            去登录
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-16">
      <Card hover={false} className="p-8">
        <div className="flex flex-col items-center text-center">
          {info.app.logoUrl ? (
            <img
              src={info.app.logoUrl}
              alt={`${info.app.name} 图标`}
              className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber/30 bg-amber/10 text-amber">
              <Orbit className="h-8 w-8" />
            </div>
          )}
          <h1 className="mt-4 text-lg font-semibold text-ink">授权登录确认</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{info.app.name}</span> 申请使用你的空间站通行证登录
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-amber">
            <ShieldCheck className="h-4 w-4" />
            授权后对方可获得以下基础信息
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>· 昵称：{user?.nickname ?? '当前通行证昵称'}</li>
            <li>· 头像与用户 ID（用于识别登录身份）</li>
          </ul>
        </div>

        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            loading={submitting === 'deny'}
            disabled={submitting !== null}
            onClick={() => handleDecision(false)}
          >
            拒绝
          </Button>
          <Button
            loading={submitting === 'approve'}
            disabled={submitting !== null}
            onClick={() => handleDecision(true)}
          >
            同意授权
          </Button>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          确认后将跳转回 {new URL(info.redirectUri).origin}。如非你本人操作，请拒绝本次授权。
        </p>
      </Card>
    </div>
  );
}
