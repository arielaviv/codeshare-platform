import { Router, Request, Response, NextFunction } from 'express';
import { Comment } from '../models/Comment';
import { Post } from '../models/Post';
import { commentSchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   get:
 *     summary: Get comments for a post
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: postId
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
 *         description: List of comments
 */
router.get(
  '/posts/:postId/comments',
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

      const [comments, total] = await Promise.all([
        Comment.find({ postId })
          .populate('userId', 'username profileImage')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Comment.countDocuments({ postId }),
      ]);

      res.json({
        comments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + comments.length < total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment added successfully
 */
router.post(
  '/posts/:postId/comments',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;

      const validation = commentSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ApiError(validation.error.errors[0].message, 400);
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new ApiError('Post not found', 404);
      }

      const comment = new Comment({
        postId,
        userId: req.user!._id,
        content: validation.data.content,
      });

      await comment.save();
      await comment.populate('userId', 'username profileImage');

      // Update comment count
      post.commentsCount += 1;
      await post.save();

      res.status(201).json({
        message: 'Comment added successfully',
        comment,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/comments/{id}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
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
 *         description: Comment deleted successfully
 */
router.delete(
  '/comments/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const comment = await Comment.findById(req.params.id);

      if (!comment) {
        throw new ApiError('Comment not found', 404);
      }

      if (comment.userId.toString() !== req.user!._id.toString()) {
        throw new ApiError('Not authorized to delete this comment', 403);
      }

      await Comment.findByIdAndDelete(req.params.id);

      // Update comment count
      await Post.findByIdAndUpdate(comment.postId, {
        $inc: { commentsCount: -1 },
      });

      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
