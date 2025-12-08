import { Router, Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
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

    // Clear refresh token
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
    },
  });
});

export default router;
