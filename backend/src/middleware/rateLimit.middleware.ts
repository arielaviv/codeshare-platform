import rateLimit from 'express-rate-limit';

export const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    status: 'error',
    message: 'Too many AI requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    status: 'error',
    message: 'Chat rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const agentRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: {
    status: 'error',
    message: 'Agent rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const deckGenerationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    status: 'error',
    message: 'Deck generation rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

// Anonymous landing-page agent. IP-keyed (no req.user available). Tight
// cap because each call hits Anthropic without an account behind it.
export const anonBuildRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: {
    status: 'error',
    message: 'Free preview limit reached. Sign up to keep building.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const fwd = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
    return fwd || req.ip || 'anonymous';
  },
});

export const intentClassifyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: {
    status: 'error',
    message: 'Intent classification rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const computerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    status: 'error',
    message: 'Mr8 Computer rate limit reached. Sandbox sessions are expensive — please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const bookGenerationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    status: 'error',
    message: 'Book generation rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const coverGenerationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    status: 'error',
    message: 'Cover generation rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});

export const researchRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    status: 'error',
    message: 'Research rate limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip || 'anonymous';
  },
});
