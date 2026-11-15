import { Brush, Camera, CheckCircle2 } from 'lucide-react';
import {
  GALLERY_MEDIA_TYPES,
  GALLERY_MEDIA_TYPE_LABELS,
  type GalleryMediaType,
} from '@spaceport/shared';
import { parseGalleryTags, type FieldErrors, type GalleryFormState } from '../../lib/submissionForms';
import { Field, Input, Textarea } from '../Field';
import ImageUploader from '../ImageUploader';

const MEDIA_TYPE_META: Record<GalleryMediaType, { icon: typeof Brush; hint: string }> = {
  PAINTING: { icon: Brush, hint: '手绘、板绘、插画等绘画作品' },
  PHOTOGRAPHY: { icon: Camera, hint: '线下打卡、周边拍摄等摄影作品' },
};

// 读取图片真实尺寸，用于瀑布流预占位
function readImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface GalleryFieldsProps {
  value: GalleryFormState;
  errors: FieldErrors;
  onChange: (patch: Partial<GalleryFormState>) => void;
}

export default function GalleryFields({ value, errors, onChange }: GalleryFieldsProps) {
  const tags = parseGalleryTags(value.tagsInput);

  const handleImageChange = (url: string | null) => {
    onChange({ imageUrl: url, imageWidth: null, imageHeight: null });
    if (!url) return;
    void readImageSize(url).then((size) => {
      if (size) onChange({ imageWidth: size.width, imageHeight: size.height });
    });
  };

  return (
    <div className="space-y-5">
      <Field
        label="作品图片"
        required
        error={errors.imageUrl ?? errors.image}
        hint="支持 png / jpg / jpeg / webp，大小不超过 5MB"
      >
        <ImageUploader value={value.imageUrl} onChange={handleImageChange} />
      </Field>

      <Field label="作品类型" required error={errors.mediaType}>
        <div className="grid grid-cols-2 gap-3">
          {GALLERY_MEDIA_TYPES.map((type) => {
            const meta = MEDIA_TYPE_META[type];
            const Icon = meta.icon;
            const active = value.mediaType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ mediaType: type })}
                className={`flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-amber/70 bg-amber/10 text-ink'
                    : 'border-white/10 bg-white/[0.04] text-muted hover:border-white/25'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <Icon className={`h-4 w-4 ${active ? 'text-amber' : 'text-muted'}`} />
                  {GALLERY_MEDIA_TYPE_LABELS[type]}
                  {active ? <CheckCircle2 className="ml-auto h-4 w-4 text-amber" /> : null}
                </span>
                <span className="text-[11px] leading-snug">{meta.hint}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="标题" required error={errors.title} hint={`${value.title.trim().length}/40`}>
        <Input
          value={value.title}
          maxLength={40}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="给作品起个名字"
        />
      </Field>

      <Field label="作品描述" error={errors.description} hint="可选，最多 200 个字">
        <Textarea
          value={value.description}
          rows={4}
          maxLength={200}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="介绍一下创作背景、使用工具或想对 ChiliChill 说的话"
        />
      </Field>

      <Field label="标签" error={errors.tags} hint="用逗号或空格分隔，最多 8 个，单个最长 12 个字">
        <Input
          value={value.tagsInput}
          onChange={(event) => onChange({ tagsInput: event.target.value })}
          placeholder="例如：Q版 手绘 周年庆"
        />
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-muted"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </Field>
    </div>
  );
}
