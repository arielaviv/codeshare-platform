import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';

const registerSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

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
      navigate('/chat');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] relative overflow-hidden">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      <div className="relative z-10 max-w-sm w-full px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00EAFA" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#E8E8E8] mb-1">Create your account</h1>
          <p className="text-sm text-[#888]">Start building with AI in seconds</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <input
              {...register('username')}
              placeholder="Username"
              className="w-full px-4 py-3 bg-[#141414] border border-[#2A2A2A] rounded-xl text-sm text-[#E8E8E8] placeholder:text-[#555] focus:outline-none focus:border-[#555] transition-colors"
            />
            {errors.username && <p className="text-red-400 text-xs mt-1.5">{errors.username.message}</p>}
          </div>

          <div>
            <input
              {...register('email')}
              type="email"
              placeholder="Email"
              className="w-full px-4 py-3 bg-[#141414] border border-[#2A2A2A] rounded-xl text-sm text-[#E8E8E8] placeholder:text-[#555] focus:outline-none focus:border-[#555] transition-colors"
            />
            {errors.email && <p className="text-red-400 text-xs mt-1.5">{errors.email.message}</p>}
          </div>

          <div>
            <input
              {...register('password')}
              type="password"
              placeholder="Password (min 6 characters)"
              className="w-full px-4 py-3 bg-[#141414] border border-[#2A2A2A] rounded-xl text-sm text-[#E8E8E8] placeholder:text-[#555] focus:outline-none focus:border-[#555] transition-colors"
            />
            {errors.password && <p className="text-red-400 text-xs mt-1.5">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-[#E8E8E8] text-[#0A0A0A] rounded-xl text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Creating account...' : 'Get started'}
          </button>
        </form>

        <p className="text-center text-sm text-[#666] mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-[#E8E8E8] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
