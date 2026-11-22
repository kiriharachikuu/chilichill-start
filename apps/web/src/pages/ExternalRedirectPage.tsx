import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TriangleAlert, ArrowUpRight, Home, Link2Off } from 'lucide-react';
import { parseExternalTarget } from '../lib/redirect';
import Button from '../components/Button';

/** 外链二次确认页：跳转到任何站外地址前，先明确告知用户并要求确认 */
export default function ExternalRedirectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const target = parseExternalTarget(params.get('target'));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-16 sm:px-6 lg:py-20">
      <div className="border-2 border-ink bg-white">
        <div className="flex items-center gap-2.5 border-b-2 border-ink bg-coral/10 px-5 py-3.5">
          <TriangleAlert className="h-5 w-5 shrink-0 text-coral" />
          <p className="text-sm font-black">请注意您的通行证和财产安全</p>
        </div>

        {target ? (
          <div className="space-y-5 px-5 py-6 sm:px-7">
            <p className="text-sm leading-relaxed text-space-700">
              您即将离开厚嘴唇空间站，去往：
              <span className="ml-1 break-all font-mono text-[13px] font-bold text-amber-600">
                {target}
              </span>
            </p>
            <p className="text-xs leading-relaxed text-muted">
              该链接由外部第三方提供，本站无法确认其内容安全性。请确认地址可信后再继续，谨防钓鱼网站与诈骗信息。
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                size="md"
                icon={<Home className="h-4 w-4" />}
                onClick={() => navigate('/', { replace: true })}
              >
                返回首页
              </Button>
              <a
                href={target}
                className="inline-flex h-10 items-center justify-center gap-2 bg-ink px-4 text-sm font-bold text-white transition-colors hover:bg-amber-600"
                rel="noopener noreferrer"
              >
                继续访问
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-6 sm:px-7">
            <div className="flex items-start gap-3">
              <Link2Off className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              <p className="text-sm leading-relaxed text-space-700">
                跳转链接缺失或格式不正确，无法继续访问。
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <Link
                to="/"
                replace
                className="inline-flex h-10 items-center justify-center gap-2 bg-ink px-4 text-sm font-bold text-white transition-colors hover:bg-amber-600"
              >
                <Home className="h-4 w-4" />
                返回首页
              </Link>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
        External Link Confirmation
      </p>
    </div>
  );
}
