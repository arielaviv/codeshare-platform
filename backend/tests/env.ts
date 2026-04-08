// This file runs via jest setupFiles — BEFORE any modules are loaded.
// Setting env vars here ensures they're available at module load time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ANTHROPIC_API_KEY = 'test-fake-key';
