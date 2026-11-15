import { Link2, Type } from 'lucide-react';
import type { MetaResponse } from '@spaceport/shared';
import type { FieldErrors, SiteFormState } from '../../lib/submissionForms';
import { Field, Input, Textarea } from '../Field';
import ImageUploader from '../ImageUploader';
import TagChip from '../TagChip';

interface SiteFieldsProps {
  value: SiteFormState;
  onChange: (next: SiteFormState) => void;
  meta: MetaResponse;
  errors?: FieldErrors;
}

export default function SiteFields({ value, onChange, meta, errors = {} }: SiteFieldsProps) {
  const patch = (next: Partial<SiteFormState>) => onChange({ ...value, ...next });

  const toggleTag = (tagId: string) => {
    if (value.tags.includes(tagId)) {
      patch({ tags: value.tags.filter((id) => id !== tagId) });
    } else if (value.tags.length < 8) {
      patch({ tags: [...value.tags, tagId] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="站点标题" required error={errors.title} hint="1-40 字">
          <div className="relative">
            <Type className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <Input
              value={value.title}
              maxLength={40}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="例如：辣椒粉成分测试器"
              className="pl-10"
            />
          </div>
        </Field>
        <Field label="站点链接" required error={errors.url} hint="完整 URL，将以新窗口打开">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <Input
              value={value.url}
              onChange={(event) => patch({ url: event.target.value })}
              placeholder="https://…"
              className="pl-10"
            />
          </div>
        </Field>
        <Field
          label="站点简介"
          required
          className="sm:col-span-2"
          error={errors.description}
          hint="5-200 字，告诉大家这个站点能做什么"
        >
          <Textarea
            value={value.description}
            maxLength={200}
            rows={4}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="这是一个什么样的小站？怎么玩？"
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ink/80">
          站点标签 <span className="text-coral">*</span>
          <span className="text-muted/70">（至少 1 个，最多 8 个）</span>
        </p>
        {meta.tags.sites.length ? (
          <div className="flex flex-wrap gap-1.5">
            {meta.tags.sites.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected={value.tags.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3 py-3 text-xs text-muted">
            站点标签暂未送达，请稍后刷新重试。
          </p>
        )}
        {errors.tags ? <p className="mt-1.5 text-xs text-coral">{errors.tags}</p> : null}
      </div>

      <ImageUploader
        value={value.coverUrl || null}
        onChange={(url) => patch({ coverUrl: url ?? '' })}
        variant="cover"
        label="站点封面（选填，建议 16:9）"
        hint="支持 png / jpg / jpeg / webp，不超过 5MB；缺省时以渐变首字展示"
      />
    </div>
  );
}
