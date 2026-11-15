import { useEffect, useState } from 'react';
import { ChevronDown, MapPin, X } from 'lucide-react';
import {
  MUNICIPAL_CITY_NAMES,
  REGION_NAME,
  normalizeProvinceName,
  provinceRegionCode,
} from '@spaceport/shared';
import { inputClass } from '../Field';

interface DivisionCity {
  name: string;
}

interface DivisionProvince {
  name: string;
  cities: DivisionCity[];
}

export interface CityPickerValue {
  province: string;
  city: string;
}

interface CityPickerProps {
  value: CityPickerValue;
  onChange: (next: CityPickerValue) => void;
  error?: string;
}

function cityKey(name: string): string {
  return name.replace(/(特别行政区|自治区|地区|自治州|市|盟|林区|旗)$/g, '');
}

function findProvinceByCity(divisions: DivisionProvince[], city: string): DivisionProvince | null {
  const key = cityKey(city.trim());
  if (!key) return null;
  return (
    divisions.find(
      (province) =>
        province.cities.some((item) => cityKey(item.name) === key) ||
        // 直辖市存量数据可能直接存省名（北京/上海市）
        normalizeProvinceName(province.name) === key,
    ) ?? null
  );
}

function PickerLevel({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (next: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="relative">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} appearance-none pr-12 [&>option]:bg-space-900 [&>option]:text-ink ${
            value ? 'text-ink' : 'text-muted/60'
          }`}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
      </div>
      {value ? (
        <button
          type="button"
          aria-label={`清除${label}`}
          onClick={onClear}
          className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] text-muted transition hover:border-coral/50 hover:text-coral"
        >
          <X className="h-3 w-3" />
          清除{label}
        </button>
      ) : null}
    </div>
  );
}

export default function CityPicker({ value, onChange, error }: CityPickerProps) {
  const [divisions, setDivisions] = useState<DivisionProvince[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoadError(false);
    fetch('/data/china-divisions.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fetch failed'))))
      .then((data: DivisionProvince[]) => setDivisions(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true));
  };

  useEffect(load, []);

  // 存量数据只有城市没有省份（如旧投稿「长沙」）：区划数据就绪后自动反查省份并归一化。
  useEffect(() => {
    if (!divisions || value.province || !value.city) return;
    const province = findProvinceByCity(divisions, value.city);
    if (!province) return;
    const matched =
      province.cities.find((item) => cityKey(item.name) === cityKey(value.city)) ??
      province.cities[0];
    onChange({
      province: province.name,
      city: matched?.name ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions]);

  const provinceObj = divisions?.find((item) => item.name === value.province) ?? null;
  const region = provinceRegionCode(value.province);
  const cityLabel = (name: string) =>
    provinceObj && MUNICIPAL_CITY_NAMES.includes(name) ? `${provinceObj.name}${name}` : name;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink/80">
          <MapPin className="h-3.5 w-3.5 text-amber" /> 城市选择 <span className="text-coral">*</span>
          <span className="text-muted/70">（省 → 市）</span>
        </p>
        <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-xs text-amber">
          归属：{region ? `${REGION_NAME[region]}大区` : '选择省份后自动归属大区'}
        </span>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        {loadError ? (
          <div className="flex flex-col items-center gap-2 py-5">
            <p className="text-xs text-muted">全国省市区数据加载失败，请检查网络后重试。</p>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs text-amber transition hover:bg-amber/20"
            >
              重新加载
            </button>
          </div>
        ) : !divisions ? (
          <p className="py-5 text-center text-xs text-muted">正在加载全国省市区数据…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <PickerLevel
              label="选择省份"
              placeholder="选择省份"
              value={value.province}
              options={divisions.map((item) => ({ value: item.name, label: item.name }))}
              onChange={(province) => onChange({ province, city: '' })}
              onClear={() => onChange({ province: '', city: '' })}
            />
            <PickerLevel
              label="选择城市"
              placeholder="选择城市"
              value={value.city}
              disabled={!provinceObj}
              options={(provinceObj?.cities ?? []).map((item) => ({
                value: item.name,
                label: cityLabel(item.name),
              }))}
              onChange={(city) => onChange({ ...value, city })}
              onClear={() => onChange({ ...value, city: '' })}
            />
          </div>
        )}
      </div>
      {error ? <p className="mt-1.5 text-xs text-coral">{error}</p> : null}
    </div>
  );
}
