export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${formatDate(value)} ${hour}:${minute}`;
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级到 execCommand
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

const GRADIENT_PAIRS: [string, string, string][] = [
  ['#FFB454', '#FF7A59', '#B48CFF'],
  ['#7C9BFF', '#5FE3C0', '#FFB454'],
  ['#FF7A59', '#B48CFF', '#7C9BFF'],
  ['#5FE3C0', '#7C9BFF', '#FFB454'],
  ['#B48CFF', '#FFB454', '#FF7A59'],
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return hash;
}

export function gradientFor(seed: string): string {
  const pair = GRADIENT_PAIRS[hashSeed(seed) % GRADIENT_PAIRS.length] ?? GRADIENT_PAIRS[0];
  return `linear-gradient(135deg, ${pair[0]}2e 0%, ${pair[1]}24 45%, ${pair[2]}33 100%)`;
}

export function initialOf(text: string): string {
  const trimmed = text.trim();
  return trimmed ? Array.from(trimmed)[0] : '·';
}
