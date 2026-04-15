import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { User, IUser } from '../models/User';
import { generateTokens, verifyRefreshToken } from '../utils/jwt.utils';
import { registerSchema, loginSchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(validation.error.errors[0].message, 400);
    }

    const { username, email, password } = validation.data;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ApiError('Email already registered', 409);
      }
      throw new ApiError('Username already taken', 409);
    }

    // Create user
    const user = new User({ username, email, password });
    await user.save();

    // Generate tokens
    const tokens = generateTokens(user._id, user.username);

    // Save refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        bio: user.bio,
        creditsCents: user.creditsCents || 0,
        hasClaimedWelcomeBonus: user.hasClaimedWelcomeBonus || false,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(validation.error.errors[0].message, 400);
    }

    const { email, password } = validation.data;

    // Find user with password
    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.password) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Generate tokens
    const tokens = generateTokens(user._id, user.username);

    // Save refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        bio: user.bio,
        creditsCents: user.creditsCents || 0,
        hasClaimedWelcomeBonus: user.hasClaimedWelcomeBonus || false,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError('Refresh token required', 400);
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user and check refresh token
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      throw new ApiError('Invalid refresh token', 401);
    }

    // Generate new tokens
    const tokens = generateTokens(user._id, user.username);

    // Update refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      message: 'Token refreshed successfully',
      ...tokens,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError('Invalid refresh token', 401));
    }
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError('User not found', 401);
    }

    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.user!._id,
      username: req.user!.username,
      email: req.user!.email,
      profileImage: req.user!.profileImage,
      bio: req.user!.bio,
      creditsCents: req.user!.creditsCents || 0,
      hasClaimedWelcomeBonus: req.user!.hasClaimedWelcomeBonus || false,
    },
  });
});

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
/**
 * Build the allowlist of frontend origins this server will redirect to after
 * Google OAuth. Pulls from `FRONTEND_URLS` (comma-separated), falls back to
 * `FRONTEND_URL`, and always permits any `http://localhost:<port>` in dev so
 * the Vite auto-port-bump (5173 → 5174 → …) doesn't break the round-trip.
 */
function getReturnToAllowlist(): string[] {
  const list = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.length === 0) list.push('http://localhost:5173');
  return list;
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function resolveReturnTo(raw: string | undefined): string {
  const fallback = getReturnToAllowlist()[0];
  if (!raw) return fallback;
  let candidate: string;
  try {
    candidate = decodeURIComponent(raw).replace(/\/+$/, '');
  } catch {
    return fallback;
  }
  // Only accept a bare origin (scheme://host[:port]); reject paths/queries to
  // prevent open-redirect to attacker-controlled URLs.
  let originOnly: string;
  try {
    const u = new URL(candidate);
    originOnly = `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
  const allowlist = getReturnToAllowlist();
  if (allowlist.includes(originOnly)) return originOnly;
  if (isLocalhostOrigin(originOnly)) return originOnly;
  return fallback;
}

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: returnTo
 *         schema:
 *           type: string
 *         description: Frontend origin to redirect to after Google callback.
 *           Must be in FRONTEND_URLS allowlist (or any localhost in dev).
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/google', (req, res, next) => {
  const returnTo = resolveReturnTo(req.query.returnTo as string | undefined);
  // Stash the validated origin in the OAuth `state` param. Google echoes it
  // back at callback time. Base64-url so it survives URL transit.
  const state = Buffer.from(returnTo, 'utf8').toString('base64url');
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state,
  } as never)(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req: Request, res: Response) => {
    const user = req.user as IUser;
    const tokens = generateTokens(user._id, user.username);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    let returnTo = getReturnToAllowlist()[0];
    const stateRaw = req.query.state as string | undefined;
    if (stateRaw) {
      try {
        const decoded = Buffer.from(stateRaw, 'base64url').toString('utf8');
        // Re-validate on the way out — never trust a round-tripped value blindly.
        returnTo = resolveReturnTo(encodeURIComponent(decoded));
      } catch {
        // fall back to the allowlist default
      }
    }

    res.redirect(
      `${returnTo}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
    );
  }
);

export default router;
