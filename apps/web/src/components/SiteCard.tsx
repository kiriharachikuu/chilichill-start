import { useState } from 'react';
import { ArrowUpRight, Globe2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { spaceHref, type Site } from '@spaceport/shared';
import { gradientFor, initialOf } from '../lib/format';
import { externalRedirectHref } from '../lib/redirect';
import Card from './Card';
import TagChip from './TagChip';

export default function SiteCard({ site }: { site: Site }) {
  const [imageOk, setImageOk] = useState(true);
  const hasCover = Boolean(site.coverUrl) && imageOk;

  return (
    <Card className="group flex h-full flex-col overflow-hidden" padded={false}>
      <div className="relative h-36 overflow-hidden border-b border-white/8">
        {hasCover ? (
          <img
            src={site.coverUrl ?? ''}
            alt={`${site.title} 封面`}
            onError={() => setImageOk(false)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundImage: gradientFor(site.title) }}
          >
            <span className="text-4xl font-semibold text-ink/85">{initialOf(site.title)}</span>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-space-950/50 px-2 py-1 text-[10px] text-muted backdrop-blur">
              <Globe2 className="h-3 w-3" /> 站点
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <Link
          to={externalRedirectHref(site.url)}
          className="flex items-start justify-between gap-2 text-base font-semibold text-ink transition hover:text-mint"
        >
          <span className="line-clamp-1">{site.title}</span>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition group-hover:text-mint" />
        </Link>
        <p className="mt-2 line-clamp-3 min-h-[3.9rem] text-sm leading-relaxed text-muted">
          {site.description}
        </p>
        <div className="mt-auto pt-4">
          {site.uploader ? (
            <Link
              to={spaceHref(site.uploader.uid)}
              className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted/80 transition hover:text-amber"
              title={`查看 ${site.uploader.nickname} 的个人空间`}
            >
              <UserRound className="h-3 w-3" />
              {site.uploader.nickname} 上传
            </Link>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {site.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
