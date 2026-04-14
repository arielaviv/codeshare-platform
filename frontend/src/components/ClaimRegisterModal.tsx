import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import confetti from 'canvas-confetti';
import { useAuth } from '../contexts/AuthContext';
import { adoptAnonBuild } from '../services/anonBuildStream';
import mr8Logo from '../assets/mr8-logo.png';

const registerSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

interface Props {
  buildId: string;
  prompt: string;
  prizeCents: number;
}

export const ADOPTED_BUILD_STORAGE_KEY = 'mr8-adopted-build';

export interface AdoptedBuildHandoff {
  prompt: string;
  files: Record<string, string>;
  assistantText: string;
  awardedCents: number;
}

function fireClaimConfetti() {
  const colors = ['#FB7701', '#FFB800', '#FFFFFF', '#FF9A3C', '#0B8800'];
  confetti({
    particleCount: 220,
    spread: 120,
    startVelocity: 55,
    origin: { y: 0.5 },
    colors,
    scalar: 1.2,
  });
}

export default function ClaimRegisterModal({ buildId, prompt, prizeCents }: Props) {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const completeAdoption = async (accessToken: string) => {
    const result = await adoptAnonBuild(buildId, accessToken);
    const handoff: AdoptedBuildHandoff = {
      prompt: result.prompt,
      files: result.files,
      assistantText: result.assistantText,
      awardedCents: result.awardedCents,
    };
    sessionStorage.setItem(ADOPTED_BUILD_STORAGE_KEY, JSON.stringify(handoff));
    fireClaimConfetti();
    navigate('/chat', { replace: true });
  };

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    setClaiming(true);
    try {
      await registerUser(data.username, data.email, data.password);
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('Missing session token');
      await completeAdoption(token);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        'Could not claim your build';
      setError(msg);
      setClaiming(false);
    }
  };

  const handleGoogle = () => {
    sessionStorage.setItem(
      'mr8-pending-adopt',
      JSON.stringify({ buildId, prompt, prizeCents })
    );
    window.location.href = 'http://localhost:5000/api/auth/google';
  };

  const prizeDollars = (prizeCents / 100).toFixed(prizeCents % 100 === 0 ? 0 : 2);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      style={{ animation: 'mr8-claim-overlay 0.25s ease-out' }}
    >
      <div
        className="relative bg-white dark:bg-[#141414] border border-brand-orange/40 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_24px_80px_rgba(251,119,1,0.4)]"
        style={{ animation: 'mr8-claim-pop 0.5s cubic-bezier(0.18, 1.2, 0.4, 1)' }}
      >
        {/* Reward header */}
        <div className="relative p-6 pb-5 bg-gradient-to-br from-brand-orange-soft to-white dark:from-brand-orange/20 dark:to-[#1A1A1A] text-center border-b border-brand-orange/30">
          <img
            src={mr8Logo}
            alt=""
            width={48}
            height={48}
            className="mx-auto rounded-xl mb-3 shadow-[0_6px_20px_rgba(251,119,1,0.5)]"
          />
          <div className="text-[11px] uppercase tracking-[0.25em] text-brand-orange font-bold mb-1">
            Jackpot
          </div>
          <div
            className="text-4xl font-black text-ink dark:text-white mb-1"
            style={{ textShadow: '0 2px 18px rgba(251,119,1,0.4)' }}
          >
            +${prizeDollars} in Mr8 credit
          </div>
          <div className="text-xs text-ink-secondary dark:text-[#A0A0A0]">
            Claim it and save your build
          </div>
        </div>

        <div className="p-5 space-y-3">
          {error && (
            <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={claiming}
            className="w-full flex items-center justify-center gap-2.5 py-3 bg-white dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] text-ink dark:text-[#E8E8E8] rounded-xl font-medium text-sm hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.05)] disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-edge dark:border-[#2A2A2A]" />
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="px-3 bg-white dark:bg-[#141414] text-ink-tertiary dark:text-[#666]">or sign up with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
            <div>
              <input
                {...register('username')}
                placeholder="Username"
                disabled={claiming}
                className="w-full px-3 py-2.5 bg-surface-secondary dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange transition-colors"
              />
              {errors.username && (
                <p className="text-status-error text-[11px] mt-1">{errors.username.message}</p>
              )}
            </div>
            <div>
              <input
                {...register('email')}
                type="email"
                placeholder="Email"
                disabled={claiming}
                className="w-full px-3 py-2.5 bg-surface-secondary dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange transition-colors"
              />
              {errors.email && (
                <p className="text-status-error text-[11px] mt-1">{errors.email.message}</p>
              )}
            </div>
            <div>
              <input
                {...register('password')}
                type="password"
                placeholder="Password (min 6)"
                disabled={claiming}
                className="w-full px-3 py-2.5 bg-surface-secondary dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange transition-colors"
              />
              {errors.password && (
                <p className="text-status-error text-[11px] mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={claiming}
              className="w-full py-3 mt-2 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-70 rounded-full text-white text-sm font-bold tracking-wide shadow-[0_8px_24px_rgba(251,119,1,0.5)] transition-colors flex items-center justify-center gap-2"
            >
              {claiming ? (
                'Claiming...'
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14m-7-7l7 7-7 7" />
                  </svg>
                  Claim ${prizeDollars} and save build
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes mr8-claim-overlay { 0% { opacity: 0 } 100% { opacity: 1 } }
        @keyframes mr8-claim-pop {
          0% { transform: scale(0.7) translateY(20px); opacity: 0; }
          60% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
