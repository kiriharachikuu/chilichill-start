import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MapPin, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import {
  REGIONS,
  TAG_SCOPES,
  type RegionCode,
  type Tag,
  type TagScope,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { clearMetaCache } from '../../lib/meta';
import { useAdminList } from '../../lib/useAdminList';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import Modal from '../../components/Modal';
import SearchInput from '../../components/SearchInput';
import TagChip from '../../components/TagChip';
import { useToast } from '../../components/Toast';

interface CityRule {
  id: string;
  city: string;
  regionCode: string;
  regionName: string;
  province: string | null;
  sortOrder: number;
}

interface AutoTagRuleItem {
  id: string;
  keyword: string;
  tagId: string;
  scope: TagScope;
  priority: number;
  tag: Tag;
}

interface AdminTag extends Tag {
  groupCount: number;
  siteCount: number;
}

type RuleTab = 'CITY' | 'AUTO';

const SCOPE_LABELS: Record<TagScope, string> = {
  GROUP: '群标签',
  SITE: '站点标签',
  BOTH: '通用',
};

interface CityFormState {
  city: string;
  province: string;
  regionCode: RegionCode | '';
}

interface AutoFormState {
  keyword: string;
  tagId: string;
  scope: TagScope;
  priority: string;
}

type CityEditor = { mode: 'create' } | { mode: 'edit'; item: CityRule };
type AutoEditor = { mode: 'create' } | { mode: 'edit'; item: AutoTagRuleItem };

type CityErrors = Partial<Record<keyof CityFormState, string>>;
type AutoErrors = Partial<Record<keyof AutoFormState, string>>;

interface ConfirmTarget {
  kind: 'city' | 'auto';
  id: string;
  title: string;
  subtitle: string;
}

const EMPTY_CITY_FORM: CityFormState = { city: '', province: '', regionCode: '' };
const EMPTY_AUTO_FORM: AutoFormState = { keyword: '', tagId: '', scope: 'GROUP', priority: '0' };

function regionName(code: string): string {
  return REGIONS.find((region) => region.code === code)?.name ?? code;
}

export default function AdminRulesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<RuleTab>('CITY');

  const [citySearch, setCitySearch] = useState('');
  const debouncedCitySearch = useDebouncedValue(citySearch, 300);
  const {
    items: cityRules,
    loading: cityLoading,
    failed: cityFailed,
    reload: reloadCityRules,
  } = useAdminList<CityRule>((client) =>
    client
      .get<{ items: CityRule[] }>('/api/admin/city-rules', {
        q: debouncedCitySearch || undefined,
      })
      .then((result) => result.items),
  );
  const [cityEditor, setCityEditor] = useState<CityEditor | null>(null);
  const [cityForm, setCityForm] = useState<CityFormState>(EMPTY_CITY_FORM);
  const [cityErrors, setCityErrors] = useState<CityErrors>({});
  const [cityServerError, setCityServerError] = useState('');
  const [citySaving, setCitySaving] = useState(false);

  const {
    items: autoRules,
    loading: autoLoading,
    failed: autoFailed,
    reload: reloadAutoRules,
  } = useAdminList<AutoTagRuleItem>((client) =>
    client
      .get<{ items: AutoTagRuleItem[] }>('/api/admin/auto-tag-rules')
      .then((result) => result.items),
  );
  const [autoEditor, setAutoEditor] = useState<AutoEditor | null>(null);
  const [autoForm, setAutoForm] = useState<AutoFormState>(EMPTY_AUTO_FORM);
  const [autoErrors, setAutoErrors] = useState<AutoErrors>({});
  const [autoServerError, setAutoServerError] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);

  const [tags, setTags] = useState<AdminTag[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // useAdminList 仅支持手动 reload，搜索词防抖变化时在此触发城市列表重新拉取
  const prevCitySearchRef = useRef(debouncedCitySearch);
  useEffect(() => {
    if (prevCitySearchRef.current === debouncedCitySearch) return;
    prevCitySearchRef.current = debouncedCitySearch;
    reloadCityRules();
  }, [debouncedCitySearch, reloadCityRules]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ items: AdminTag[] }>('/api/admin/tags')
      .then((result) => {
        if (alive) setTags(result.items);
      })
      .catch(() => {
        if (alive) setTags([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const availableTags = useMemo(() => {
    if (!autoForm.scope) return tags;
    return tags.filter((tag) => tag.scope === autoForm.scope || tag.scope === 'BOTH');
  }, [tags, autoForm.scope]);

  const openCityCreate = () => {
    setCityEditor({ mode: 'create' });
    setCityForm(EMPTY_CITY_FORM);
    setCityErrors({});
    setCityServerError('');
  };

  const openCityEdit = (item: CityRule) => {
    setCityEditor({ mode: 'edit', item });
    setCityForm({
      city: item.city,
      province: item.province ?? '',
      regionCode: (item.regionCode as RegionCode) ?? '',
    });
    setCityErrors({});
    setCityServerError('');
  };

  const submitCity = async () => {
    if (!cityEditor) return;
    const errors: CityErrors = {};
    if (!cityForm.city.trim()) errors.city = '请填写城市名称';
    else if (cityForm.city.trim().length > 30) errors.city = '城市名称最多 30 个字';
    if (!cityForm.regionCode) errors.regionCode = '请选择所属大区';
    if (cityForm.province.trim().length > 30) errors.province = '省份名称最多 30 个字';
    setCityErrors(errors);
    if (Object.keys(errors).length) return;

    setCitySaving(true);
    setCityServerError('');
    try {
      const body = {
        city: cityForm.city.trim(),
        regionCode: cityForm.regionCode,
        province: cityForm.province.trim() || null,
      };
      if (cityEditor.mode === 'create') {
        await api.post<{ item: CityRule }>('/api/admin/city-rules', body);
        toast.success('城市映射已建立');
      } else {
        await api.patch<{ item: CityRule }>(`/api/admin/city-rules/${cityEditor.item.id}`, body);
        toast.success('城市映射已更新');
      }
      setCityEditor(null);
      reloadCityRules();
      clearMetaCache();
    } catch (error) {
      setCityServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setCitySaving(false);
    }
  };

  const openAutoCreate = () => {
    setAutoEditor({ mode: 'create' });
    setAutoForm(EMPTY_AUTO_FORM);
    setAutoErrors({});
    setAutoServerError('');
  };

  const openAutoEdit = (item: AutoTagRuleItem) => {
    setAutoEditor({ mode: 'edit', item });
    setAutoForm({
      keyword: item.keyword,
      tagId: item.tagId,
      scope: item.scope,
      priority: String(item.priority),
    });
    setAutoErrors({});
    setAutoServerError('');
  };

  const submitAuto = async () => {
    if (!autoEditor) return;
    const errors: AutoErrors = {};
    if (!autoForm.keyword.trim()) errors.keyword = '请填写关键词';
    else if (autoForm.keyword.trim().length > 20) errors.keyword = '关键词最多 20 个字';
    if (!autoForm.tagId) errors.tagId = '请选择要自动打上的标签';
    if (autoForm.priority.trim() && !Number.isInteger(Number(autoForm.priority))) {
      errors.priority = '优先级需为整数';
    }
    setAutoErrors(errors);
    if (Object.keys(errors).length) return;

    setAutoSaving(true);
    setAutoServerError('');
    try {
      const body = {
        keyword: autoForm.keyword.trim(),
        tagId: autoForm.tagId,
        scope: autoForm.scope,
        priority: Number(autoForm.priority || 0),
      };
      if (autoEditor.mode === 'create') {
        await api.post<{ item: AutoTagRuleItem }>('/api/admin/auto-tag-rules', body);
        toast.success('自动打标规则已生效');
      } else {
        await api.patch<{ item: AutoTagRuleItem }>(
          `/api/admin/auto-tag-rules/${autoEditor.item.id}`,
          body,
        );
        toast.success('自动打标规则已更新');
      }
      setAutoEditor(null);
      reloadAutoRules();
    } catch (error) {
      setAutoServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setAutoSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      const base = confirmTarget.kind === 'city' ? '/api/admin/city-rules' : '/api/admin/auto-tag-rules';
      await api.delete<void>(`${base}/${confirmTarget.id}`);
      toast.success('规则已删除');
      setConfirmTarget(null);
      if (confirmTarget.kind === 'city') {
        reloadCityRules();
        clearMetaCache();
      } else {
        reloadAutoRules();
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败，请稍后再试');
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Sparkles className="h-5 w-5 text-mint" /> 规则管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            维护城市与大区映射、关键词自动打标，让新投稿自动落入正确舱段。
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={() => setTab('CITY')}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              tab === 'CITY' ? 'bg-mint/15 font-medium text-mint' : 'text-muted hover:text-ink'
            }`}
          >
            城市映射 · {cityRules.length}
          </button>
          <button
            type="button"
            onClick={() => setTab('AUTO')}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              tab === 'AUTO' ? 'bg-mint/15 font-medium text-mint' : 'text-muted hover:text-ink'
            }`}
          >
            自动打标 · {autoRules.length}
          </button>
        </div>
      </div>

      {tab === 'CITY' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-72">
              <SearchInput
                value={citySearch}
                onChange={setCitySearch}
                placeholder="搜索城市、省份或大区…"
              />
            </div>
            <div className="flex items-center gap-2">
              {cityFailed ? (
                <button
                  type="button"
                  onClick={reloadCityRules}
                  className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 重试
                </button>
              ) : null}
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCityCreate}>
                新增城市映射
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted/70">
            投稿选择地区时，系统会按此处映射自动补全大区；未收录城市可在下方添加。
          </p>

          {cityLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
                />
              ))}
            </div>
          ) : cityFailed ? (
            <EmptyState
              title="城市映射读取失败"
              description="请确认管理员权限与后端服务状态，或稍后重试。"
              icon={RefreshCw}
              action={
                <Button variant="secondary" size="sm" onClick={reloadCityRules}>
                  重新加载
                </Button>
              }
            />
          ) : cityRules.length ? (
            <Card hover={false} padded={false} className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_6rem] gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 sm:grid">
                <span>城市</span>
                <span>省份</span>
                <span>归属大区</span>
                <span className="text-right">操作</span>
              </div>
              <div className="divide-y divide-white/8">
                {cityRules.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_6rem] sm:items-center sm:gap-3"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <MapPin className="h-3.5 w-3.5 text-mint" /> {item.city}
                    </span>
                    <span className="text-xs text-muted">{item.province || '—'}</span>
                    <span>
                      <Badge tone="mint">
                        {item.regionName || regionName(item.regionCode)}
                      </Badge>
                    </span>
                    <div className="flex items-center gap-1.5 sm:justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openCityEdit(item)}
                        aria-label="编辑城市映射"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() =>
                          setConfirmTarget({
                            kind: 'city',
                            id: item.id,
                            title: `删除「${item.city}」的城市映射？`,
                            subtitle: `当前归属 ${item.regionName || regionName(item.regionCode)}，删除后该城市不再自动归类。`,
                          })
                        }
                        aria-label="删除城市映射"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title={citySearch ? '没有匹配的城市' : '还没有城市映射'}
              description={
                citySearch ? '换个关键词试试。' : '添加第一个城市，让地区群自动找到自己的大区。'
              }
              icon={MapPin}
              action={
                <Button variant="secondary" size="sm" onClick={openCityCreate}>
                  新增城市映射
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-muted/70">
              投稿名称或简介命中关键词时，会自动打上对应标签；优先级越高越先匹配。
            </p>
            <div className="flex items-center gap-2">
              {autoFailed ? (
                <button
                  type="button"
                  onClick={reloadAutoRules}
                  className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 重试
                </button>
              ) : null}
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAutoCreate}>
                新增打标规则
              </Button>
            </div>
          </div>

          {autoLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
                />
              ))}
            </div>
          ) : autoFailed ? (
            <EmptyState
              title="自动打标规则读取失败"
              description="请确认管理员权限与后端服务状态，或稍后重试。"
              icon={RefreshCw}
              action={
                <Button variant="secondary" size="sm" onClick={reloadAutoRules}>
                  重新加载
                </Button>
              }
            />
          ) : autoRules.length ? (
            <Card hover={false} padded={false} className="overflow-hidden">
              <div className="divide-y divide-white/8">
                {autoRules.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-ink">
                          {item.keyword}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted" />
                        <TagChip tag={item.tag} muted />
                        <Badge tone={item.scope === 'SITE' ? 'mint' : item.scope === 'BOTH' ? 'violet' : 'amber'}>
                          {SCOPE_LABELS[item.scope] ?? item.scope}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted/70">优先级 {item.priority}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openAutoEdit(item)}
                        aria-label="编辑打标规则"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() =>
                          setConfirmTarget({
                            kind: 'auto',
                            id: item.id,
                            title: `删除关键词「${item.keyword}」的打标规则？`,
                            subtitle: `命中后将不再自动打上「${item.tag.name}」。`,
                          })
                        }
                        aria-label="删除打标规则"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="还没有自动打标规则"
              description="添加关键词与标签，让投稿自动带上合适的轨道标记。"
              icon={Sparkles}
              action={
                <Button variant="secondary" size="sm" onClick={openAutoCreate}>
                  新增打标规则
                </Button>
              }
            />
          )}
        </div>
      )}

      <Modal
        open={Boolean(cityEditor)}
        onClose={() => {
          if (!citySaving) setCityEditor(null);
        }}
        size="md"
        eyebrow={cityEditor?.mode === 'edit' ? 'Edit City Rule' : 'New City Rule'}
        title={cityEditor?.mode === 'edit' ? '编辑城市映射' : '新增城市映射'}
        description="为城市指定所属大区，地区群投稿时会自动填充。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={citySaving} onClick={() => setCityEditor(null)}>
              取消
            </Button>
            <Button loading={citySaving} onClick={() => void submitCity()}>
              {cityEditor?.mode === 'edit' ? '保存修改' : '创建映射'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="城市" required error={cityErrors.city}>
              <Input
                value={cityForm.city}
                maxLength={30}
                onChange={(event) => setCityForm((prev) => ({ ...prev, city: event.target.value }))}
                placeholder="例如：杭州"
              />
            </Field>
            <Field label="省份 / 行政区" error={cityErrors.province} hint="选填">
              <Input
                value={cityForm.province}
                maxLength={30}
                onChange={(event) =>
                  setCityForm((prev) => ({ ...prev, province: event.target.value }))
                }
                placeholder="浙江省"
              />
            </Field>
          </div>
          <Field label="归属大区" required error={cityErrors.regionCode}>
            <Select
              value={cityForm.regionCode}
              onChange={(event) =>
                setCityForm((prev) => ({
                  ...prev,
                  regionCode: event.target.value as RegionCode | '',
                }))
              }
            >
              <option value="">请选择大区</option>
              {REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.name}
                </option>
              ))}
            </Select>
          </Field>
          {cityServerError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {cityServerError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(autoEditor)}
        onClose={() => {
          if (!autoSaving) setAutoEditor(null);
        }}
        size="md"
        eyebrow={autoEditor?.mode === 'edit' ? 'Edit Auto Tag Rule' : 'New Auto Tag Rule'}
        title={autoEditor?.mode === 'edit' ? '编辑自动打标规则' : '新增自动打标规则'}
        description="投稿内容命中关键词时，系统会自动为其附加标签。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={autoSaving} onClick={() => setAutoEditor(null)}>
              取消
            </Button>
            <Button loading={autoSaving} onClick={() => void submitAuto()}>
              {autoEditor?.mode === 'edit' ? '保存修改' : '创建规则'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="关键词" required error={autoErrors.keyword} hint="匹配群名、站点标题或简介">
            <Input
              value={autoForm.keyword}
              maxLength={20}
              onChange={(event) => setAutoForm((prev) => ({ ...prev, keyword: event.target.value }))}
              placeholder="例如：开黑、二创、攻略"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="适用范围" required>
              <Select
                value={autoForm.scope}
                onChange={(event) => {
                  const scope = event.target.value as TagScope;
                  setAutoForm((prev) => ({ ...prev, scope, tagId: '' }));
                }}
              >
                {TAG_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {SCOPE_LABELS[scope]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="优先级" error={autoErrors.priority} hint="数值越大越先匹配">
              <Input
                type="number"
                value={autoForm.priority}
                onChange={(event) =>
                  setAutoForm((prev) => ({ ...prev, priority: event.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="自动打上的标签" required error={autoErrors.tagId}>
            <Select
              value={autoForm.tagId}
              onChange={(event) => setAutoForm((prev) => ({ ...prev, tagId: event.target.value }))}
            >
              <option value="">请选择标签</option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}（{SCOPE_LABELS[tag.scope] ?? tag.scope}）
                </option>
              ))}
            </Select>
          </Field>
          {autoServerError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {autoServerError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmTarget)}
        onClose={() => {
          if (!confirmBusy) setConfirmTarget(null);
        }}
        size="sm"
        eyebrow="Confirm Removal"
        title={confirmTarget?.title ?? '删除规则？'}
        description={confirmTarget?.subtitle}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={confirmBusy} onClick={() => setConfirmTarget(null)}>
              取消
            </Button>
            <Button variant="danger" loading={confirmBusy} onClick={() => void confirmDelete()}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-xs text-muted">删除后立即生效，已有的内容不会被回滚。</p>
      </Modal>
    </div>
  );
}
