import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import mr8Logo from '../assets/mr8-logo.png';

const registerSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const redirectPrompt = (location.state as { redirectPrompt?: string } | null)?.redirectPrompt;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    try {
      setError('');
      await registerUser(data.username, data.email, data.password);
      navigate('/welcome-spin', {
        state: redirectPrompt ? { initialPrompt: redirectPrompt } : undefined,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8] relative overflow-hidden">
      {/* Dot grid */}
      <div
        className="fixed inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Warm brand glow */}
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
          <h1 className="text-2xl font-bold mb-1">Create your account</h1>
          <p className="text-sm text-ink-tertiary dark:text-[#888]">
            Start building with AI in seconds
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-status-error/10 text-status-error border border-status-error/30 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <input
              {...register('username')}
              placeholder="Username"
              className="w-full px-4 py-3 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange dark:focus:border-brand-orange transition-colors"
            />
            {errors.username && (
              <p className="text-status-error text-xs mt-1.5">{errors.username.message}</p>
            )}
          </div>

          <div>
            <input
              {...register('email')}
              type="email"
              placeholder="Email"
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
              placeholder="Password (min 6 characters)"
              className="w-full px-4 py-3 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-xl text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none focus:border-brand-orange dark:focus:border-brand-orange transition-colors"
            />
            {errors.password && (
              <p className="text-status-error text-xs mt-1.5">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-60 rounded-full text-white text-sm font-semibold shadow-[0_4px_14px_rgba(251,119,1,0.35)] transition-colors"
          >
            {isSubmitting ? 'Creating account...' : 'Get started'}
          </button>
        </form>

        <p className="text-center text-sm text-ink-tertiary dark:text-[#666] mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-orange hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
