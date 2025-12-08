import { Router, Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { updateUserSchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { uploadProfile } from '../middleware/upload.middleware';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      profileImage: user.profileImage,
      bio: user.bio,
      createdAt: user.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       403:
 *         description: Not authorized
 */
router.put(
  '/:id',
  authenticate,
  uploadProfile,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.id !== req.user!._id.toString()) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError('Not authorized to update this profile', 403);
      }

      const validation = updateUserSchema.safeParse(req.body);
      if (!validation.success) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError(validation.error.errors[0].message, 400);
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError('User not found', 404);
      }

      // Check if username is taken
      if (validation.data.username && validation.data.username !== user.username) {
        const existing = await User.findOne({ username: validation.data.username });
        if (existing) {
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          throw new ApiError('Username already taken', 409);
        }
        user.username = validation.data.username;
      }

      if (validation.data.bio !== undefined) {
        user.bio = validation.data.bio;
      }

      // Handle profile image update
      if (req.file) {
        // Delete old image
        if (user.profileImage) {
          const oldPath = path.join(__dirname, '../..', user.profileImage);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        user.profileImage = `/uploads/${req.file.filename}`;
      }

      await user.save();

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          profileImage: user.profileImage,
          bio: user.bio,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/users/{id}/posts:
 *   get:
 *     summary: Get posts by user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User's posts
 */
router.get('/:id/posts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(id);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    const [posts, total] = await Promise.all([
      Post.find({ userId: id })
        .populate('userId', 'username profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({ userId: id }),
    ]);

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + posts.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
