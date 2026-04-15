import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import mr8Logo from '../assets/mr8-logo.png';
import { getApiBase } from '../lib/apiBase';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setError('');
      await login(data.email, data.password);
      navigate('/');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Login failed');
    }
  };

  const handleGoogleLogin = () => {
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.href = `${getApiBase()}/auth/google?returnTo=${returnTo}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8] relative overflow-hidden">
      <div
        className="fixed inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
      <div
        className="fixed inset-x-0 top-0 h-[70vh] pointer-events-none opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 55% 50% at 50% 10%, rgba(251, 119, 1, 0.18), transparent 65%)',
        }}
      />

      <div className="relative z-10 max-w-sm w-full px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <img
              src={mr8Logo}
              alt="Mr8"
              width={56}
              height={56}
              className="rounded-2xl shadow-[0_8px_28px_rgba(251,119,1,0.35)]"
            />
          </div>
          <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-ink-tertiary dark:text-[#888]">
            Sign in to continue building
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2.5 py-3 bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-ink dark:text-[#E8E8E8] rounded-xl font-medium text-sm hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Sign in with Google
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-edge dark:border-[#222]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-white dark:bg-[#0A0A0A] text-ink-tertiary dark:text-[#666]">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-status-error/10 text-status-error border border-status-error/30 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <input
              {...register('email')}
              type="email"
              placeholder="info@gmail.com"
              className="w-full px-4 py-3 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange dark:focus:border-brand-orange transition-colors"
            />
            {errors.email && (
              <p className="text-status-error text-xs mt-1.5">{errors.email.message}</p>
            )}
          </div>

          <div>
            <input
              {...register('password')}
              type="password"
              placeholder="Password"
              className="w-full px-4 py-3 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange dark:focus:border-brand-orange transition-colors"
            />
            {errors.password && (
              <p className="text-status-error text-xs mt-1.5">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-60 rounded-full text-white text-sm font-semibold shadow-[0_4px_14px_rgba(251,119,1,0.35)] transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Signing in...' : (
              <>
                Sign in
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-ink-tertiary dark:text-[#666] mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-orange hover:underline font-semibold">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
