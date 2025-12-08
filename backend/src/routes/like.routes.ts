import { Router, Request, Response, NextFunction } from 'express';
import { Like } from '../models/Like';
import { Post } from '../models/Post';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/posts/{postId}/like:
 *   post:
 *     summary: Toggle like on a post
 *     tags: [Likes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Like toggled successfully
 */
router.post(
  '/posts/:postId/like',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const userId = req.user!._id;

      const post = await Post.findById(postId);
      if (!post) {
        throw new ApiError('Post not found', 404);
      }

      // Check if already liked
      const existingLike = await Like.findOne({ postId, userId });

      if (existingLike) {
        // Unlike
        await Like.findByIdAndDelete(existingLike._id);
        post.likesCount = Math.max(0, post.likesCount - 1);
        await post.save();

        res.json({
          message: 'Post unliked',
          isLiked: false,
          likesCount: post.likesCount,
        });
      } else {
        // Like
        const like = new Like({ postId, userId });
        await like.save();
        post.likesCount += 1;
        await post.save();

        res.json({
          message: 'Post liked',
          isLiked: true,
          likesCount: post.likesCount,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/posts/{postId}/likes:
 *   get:
 *     summary: Get users who liked a post
 *     tags: [Likes]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users who liked the post
 */
router.get(
  '/posts/:postId/likes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const post = await Post.findById(postId);
      if (!post) {
        throw new ApiError('Post not found', 404);
      }

      const [likes, total] = await Promise.all([
        Like.find({ postId })
          .populate('userId', 'username profileImage')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Like.countDocuments({ postId }),
      ]);

      res.json({
        likes: likes.map((l) => l.userId),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
