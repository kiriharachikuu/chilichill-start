import { Link } from 'react-router-dom';
import { Orbit, Telescope } from 'lucide-react';
import { buttonClass } from '../components/Button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center sm:px-6">
      <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/12 bg-white/[0.03]">
        <div className="absolute inset-2 animate-[spin_24s_linear_infinite] rounded-full border border-dashed border-amber/30" />
        <Orbit className="h-9 w-9 text-amber" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.32em] text-muted">Signal Lost · 404</p>
      <h1 className="mt-3 bg-gradient-to-r from-amber via-coral to-aurora bg-clip-text text-3xl font-semibold text-transparent">
        这条轨道不存在
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        你访问的舱段可能已经迁移，或链接在传输中丢失了坐标。回到主舱段重新校准吧。
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/" className={buttonClass({ variant: 'primary', size: 'md' })}>
          返回主舱段
        </Link>
        <Link to="/groups" className={buttonClass({ variant: 'secondary', size: 'md' })}>
          <Telescope className="h-4 w-4" /> 浏览群舱
        </Link>
      </div>
    </div>
  );
}
