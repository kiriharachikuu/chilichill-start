import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

interface ImageUploaderProps {
  value: string | null;
  onChange: (url: string | null) => void;
  variant?: 'cover' | 'square';
  label?: string;
  hint?: string;
}

export default function ImageUploader({
  value,
  onChange,
  variant = 'cover',
  label = '上传图片',
  hint = '支持 png / jpg / jpeg / webp，大小不超过 5MB',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('仅支持 png / jpg / jpeg / webp 格式');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('图片大小不能超过 5MB');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.postForm<{ url: string; key: string }>('/api/uploads', form);
      onChange(result.url);
      toast.success('图片已上传');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败，请稍后再试');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-ink/80">{label}</span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-coral"
          >
            <Trash2 className="h-3.5 w-3.5" /> 移除
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div
          className={`relative overflow-hidden rounded-xl border border-white/10 bg-space-900/60 ${
            variant === 'square' ? 'h-40 w-40' : 'h-40 w-full'
          }`}
        >
          <img
            src={value}
            alt="已上传的图片"
            className={variant === 'square' ? 'h-full w-full object-contain p-2' : 'h-full w-full object-cover'}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-x-3 bottom-3 rounded-lg border border-white/15 bg-space-950/75 px-3 py-1.5 text-xs text-ink backdrop-blur transition hover:border-amber/50"
          >
            更换图片
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-muted transition hover:border-amber/40 hover:bg-white/[0.06] disabled:opacity-60 ${
            variant === 'square' ? 'h-40 w-40' : 'h-40'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-amber" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-amber">
              {variant === 'square' ? <ImagePlus className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </span>
          )}
          <span className="text-xs">{uploading ? '正在上传…' : '点击选择图片'}</span>
        </button>
      )}
      <p className="mt-1.5 text-xs text-muted/80">{hint}</p>
    </div>
  );
}
