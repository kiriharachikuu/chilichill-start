import { useMemo, useEffect, useState } from 'react';
import {
  GraduationCap,
  Link2,
  MapPin,
  MoreHorizontal,
  Users,
  Wand2,
} from 'lucide-react';
import { GROUP_TYPE_LABELS, type GroupType, type MetaResponse, type Tag } from '@spaceport/shared';
import { api } from '../../lib/api';
import type { FieldErrors, GroupFormState } from '../../lib/submissionForms';
import Badge from '../Badge';
import { Field, Input, Textarea } from '../Field';
import ImageUploader from '../ImageUploader';
import TagChip from '../TagChip';
import { useToast } from '../Toast';
import CityPicker from './CityPicker';

const TYPE_OPTIONS: {
  value: GroupType;
  desc: string;
  icon: typeof MapPin;
  tone: string;
}[] = [
  {
    value: 'GENERAL',
    desc: '应援、二创、资源等功能向交流群',
    icon: Users,
    tone: 'border-aurora/40 bg-aurora/10 text-aurora',
  },
  {
    value: 'REGION',
    desc: '按城市聚集的同城伙伴',
    icon: MapPin,
    tone: 'border-amber/40 bg-amber/10 text-amber',
  },
  {
    value: 'COLLEGE',
    desc: '高校同好，需填写城市与学校',
    icon: GraduationCap,
    tone: 'border-violet/40 bg-violet/10 text-violet',
  },
  {
    value: 'OTHER',
    desc: '其他用途，由站长协助分类',
    icon: MoreHorizontal,
    tone: 'border-white/30 bg-white/10 text-ink/85',
  },
];

const NEEDS_CITY: GroupType[] = ['REGION', 'COLLEGE'];
const NEEDS_TAG: GroupType[] = ['GENERAL', 'OTHER'];

interface GroupFieldsProps {
  value: GroupFormState;
  onChange: (next: GroupFormState) => void;
  meta: MetaResponse;
  errors?: FieldErrors;
}

export default function GroupFields({ value, onChange, meta, errors = {} }: GroupFieldsProps) {
  const toast = useToast();
  const [suggestions, setSuggestions] = useState<Tag[]>([]);

  const patch = (next: Partial<GroupFormState>) => onChange({ ...value, ...next });

  const tagPool = useMemo(() => {
    const functionTags = meta.tags.group.filter((tag) => tag.kind === 'FUNCTION');
    const customTags = meta.tags.group.filter((tag) => tag.kind !== 'FUNCTION');
    return [...functionTags, ...customTags];
  }, [meta.tags.group]);

  useEffect(() => {
    const query = `${value.name} ${value.description}`.trim();
    if (!value.type || query.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      api
        .get<{ items: Tag[] }>('/api/groups/tag-suggestions', { q: query })
        .then((result) => {
          if (alive) setSuggestions(result.items ?? []);
        })
        .catch(() => {
          if (alive) setSuggestions([]);
        });
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [value.name, value.description, value.type]);

  const toggleTag = (tagId: string) => {
    if (value.tags.includes(tagId)) {
      patch({ tags: value.tags.filter((id) => id !== tagId) });
      return;
    }
    if (value.tags.length >= 8) {
      toast.error('最多选择 8 个标签');
      return;
    }
    patch({ tags: [...value.tags, tagId] });
  };

  const recommendation = suggestions.filter((tag) => !value.tags.includes(tag.id)).slice(0, 6);
  const tagRequired = NEEDS_TAG.includes(value.type as GroupType);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink/80">
          群类型 <span className="text-coral">*</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = value.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  patch({
                    type: option.value,
                    province: NEEDS_CITY.includes(option.value) ? value.province : '',
                    city: NEEDS_CITY.includes(option.value) ? value.city : '',
                    school: option.value === 'COLLEGE' ? value.school : '',
                  })
                }
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  active
                    ? `${option.tone} -translate-y-0.5 shadow-glow`
                    : 'border-white/10 bg-white/[0.04] text-ink hover:-translate-y-0.5 hover:border-white/25'
                }`}
              >
                <span className={`mt-0.5 rounded-lg border p-1.5 ${active ? 'border-white/20' : 'border-white/10'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{GROUP_TYPE_LABELS[option.value]}</span>
                  <span className={`mt-0.5 block text-[11px] ${active ? 'text-ink/80' : 'text-muted'}`}>
                    {option.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {errors.type ? <p className="mt-1.5 text-xs text-coral">{errors.type}</p> : null}
      </div>

      {NEEDS_CITY.includes(value.type as GroupType) ? (
        <CityPicker
          value={{ province: value.province, city: value.city }}
          onChange={(next) => patch(next)}
          error={errors.province ?? errors.city}
        />
      ) : null}

      {value.type === 'COLLEGE' ? (
        <Field label="学校名称" required error={errors.school} hint="填写学校全称或常用简称（40 字以内）">
          <Input
            value={value.school}
            maxLength={40}
            onChange={(event) => patch({ school: event.target.value })}
            placeholder="例如：武汉大学"
          />
        </Field>
      ) : null}

      {value.type ? (
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink/80">
            标签
            {tagRequired ? (
              <>
                <span className="text-coral">*</span>
                <span className="text-muted/70">（至少 1 个）</span>
              </>
            ) : (
              <span className="text-muted/70">（选填）</span>
            )}
            <span className="text-muted/70">最多 8 个，已选 {value.tags.length}</span>
          </p>
          {tagPool.length ? (
            <div className={`flex flex-wrap gap-1.5 rounded-xl border p-3 ${
              tagRequired && value.tags.length === 0
                ? 'border-coral/50 bg-coral/[0.04]'
                : 'border-white/10 bg-white/[0.03]'
            }`}>
              {tagPool.map((tag) => (
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
              标签池暂未送达，请稍后刷新重试，或联系站长补充。
            </p>
          )}
          {errors.tags ? <p className="mt-1.5 text-xs text-coral">{errors.tags}</p> : null}
        </div>
      ) : null}

      {value.type === 'OTHER' ? (
        <Field
          label="用途说明"
          error={errors.purpose}
          hint="选填，简单说明这个群的用途，方便站长归类（120 字以内）"
        >
          <Textarea
            value={value.purpose}
            maxLength={120}
            rows={3}
            onChange={(event) => patch({ purpose: event.target.value })}
            placeholder="例如：线下观影活动联络、周边交换、语音歌回…"
          />
        </Field>
      ) : null}

      {value.type && recommendation.length ? (
        <div className="rounded-xl border border-aurora/20 bg-aurora/[0.06] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-aurora">
            <Wand2 className="h-3.5 w-3.5" /> 根据群名与简介推荐的标签
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recommendation.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-aurora/40 bg-aurora/10 px-2.5 py-1 text-xs text-aurora transition hover:border-aurora hover:bg-aurora/20"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
                <Badge tone="aurora" className="!border-0 !bg-transparent !px-0 !py-0">
                  推荐
                </Badge>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="群名" required error={errors.name} hint="2-40 字，不必刻意包含城市名">
          <Input
            value={value.name}
            maxLength={40}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="例如：广州 ChiliChill 同好群"
          />
        </Field>
        <Field label="群号" required error={errors.groupNumber} hint="5-12 位数字">
          <Input
            value={value.groupNumber}
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => patch({ groupNumber: event.target.value.replace(/[^\d]/g, '') })}
            placeholder="例如：123456789"
          />
        </Field>
        <Field
          label="群简介"
          required
          className="sm:col-span-2"
          error={errors.description}
          hint="5-200 字，介绍群的氛围与日常活动"
        >
          <Textarea
            value={value.description}
            maxLength={200}
            rows={3}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="这个群平时都在聊什么？适合什么样的伙伴加入？"
          />
        </Field>
        <Field label="加入链接" error={errors.joinUrl} hint="QQ 群邀请链接，选填">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <Input
              value={value.joinUrl}
              onChange={(event) => patch({ joinUrl: event.target.value })}
              placeholder="https://…"
              className="pl-10"
            />
          </div>
        </Field>
      </div>

      <ImageUploader
        value={value.avatarUrl || null}
        onChange={(url) => patch({ avatarUrl: url ?? '' })}
        variant="square"
        label="群头像（选填）"
        hint="支持 png / jpg / jpeg / webp，不超过 5MB"
      />

      <ImageUploader
        value={value.qrcodeUrl || null}
        onChange={(url) => patch({ qrcodeUrl: url ?? '' })}
        variant="square"
        label="群二维码（选填）"
        hint="用于入群预览，支持 png / jpg / jpeg / webp，不超过 5MB"
      />
    </div>
  );
}
