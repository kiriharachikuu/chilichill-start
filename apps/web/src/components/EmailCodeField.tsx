import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { Field, Input } from './Field';
import { useToast } from './Toast';

interface SendCodeResponse {
  expiresInSeconds: number;
  retryAfterSeconds: number;
  devCode?: string;
}

interface EmailCodeFieldProps {
  email: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** 发送验证码的接口地址：注册用 /api/auth/email-code，密码重置用 /api/auth/forgot-password */
  sendEndpoint?: string;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * 注册邮箱验证码输入框：内置邮箱格式校验、发送冷却倒计时与重复发送防刷。
 * 输入内容只保留数字并截断 6 位，避免粘贴带空格/字母的验证码。
 */
export default function EmailCodeField({
  email,
  value,
  onChange,
  error,
  disabled = false,
  sendEndpoint = '/api/auth/email-code',
}: EmailCodeFieldProps) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sentTo, setSentTo] = useState('');

  const normalizedEmail = email.trim().toLowerCase();
  const sameEmail = !sentTo || sentTo === normalizedEmail;

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown((value_) => value_ - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // 邮箱改了就重置冷却，否则用户换邮箱后会被上一次的倒计时误伤
  useEffect(() => {
    if (sentTo && sentTo !== normalizedEmail) {
      setCooldown(0);
      setSentTo('');
    }
  }, [normalizedEmail, sentTo]);

  const handleInput = (raw: string) => {
    onChange(raw.replace(/\D/g, '').slice(0, 6));
  };

  const handleSend = async () => {
    if (sending || cooldown > 0) {
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      toast.error('请先填写有效的邮箱地址');
      return;
    }

    setSending(true);
    try {
      const result = await api.post<SendCodeResponse>(sendEndpoint, { email: normalizedEmail });
      setSentTo(normalizedEmail);
      setCooldown(result.retryAfterSeconds > 0 ? result.retryAfterSeconds : 60);
      toast.success('验证码已发送，请查收邮箱');
      if (result.devCode) {
        toast.info(`开发模式验证码：${result.devCode}`);
      }
    } catch (sendError) {
      const message = sendError instanceof ApiError ? sendError.message : '验证码发送失败，请稍后再试';
      toast.error(message);
      // 服务端返回冷却中时，把剩余秒数同步到按钮倒计时，避免用户反复点击；
      // 优先消费结构化字段，文案正则只作旧响应兜底
      if (sendError instanceof ApiError && sendError.code === 'CODE_COOLDOWN') {
        const seconds =
          sendError.retryAfterSeconds && sendError.retryAfterSeconds > 0
            ? sendError.retryAfterSeconds
            : Number(message.match(/(\d+)\s*秒/)?.[1] ?? 0);
        if (seconds > 0) {
          setSentTo(normalizedEmail);
          setCooldown(seconds);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const buttonDisabled = disabled || sending || (cooldown > 0 && sameEmail);
  const buttonText = sending ? '发送中' : cooldown > 0 && sameEmail ? `${cooldown}s 后重发` : '获取验证码';

  return (
    <Field
      label="邮箱验证码"
      required
      error={error}
      hint={cooldown > 0 ? `${cooldown} 秒后可重新发送，请留意收件箱与垃圾邮件` : '6 位数字，请在有效期内使用'}
    >
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <Input
            value={value}
            onChange={(event) => handleInput(event.target.value)}
            onPaste={(event) => {
              event.preventDefault();
              handleInput(event.clipboardData.getData('text'));
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="输入 6 位验证码"
            aria-invalid={Boolean(error)}
            className="pl-10 font-mono tracking-[0.2em]"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={buttonDisabled}
          className="flex h-[42px] w-[7.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-space-200 bg-space-50 px-2 text-xs font-medium text-amber transition hover:border-amber/60 hover:bg-space-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {buttonText}
        </button>
      </div>
    </Field>
  );
}
