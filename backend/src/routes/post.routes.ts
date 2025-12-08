import { Router, Request, Response, NextFunction } from 'express';
import { Post } from '../models/Post';
import { Like } from '../models/Like';
import { createPostSchema, updatePostSchema } from '../utils/validators';
import { ApiError } from '../middleware/error.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: Get all posts with pagination
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of posts per page
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find()
        .populate('userId', 'username profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments(),
    ]);

    // If user is authenticated, check which posts they've liked
    let likedPostIds: string[] = [];
    if (req.user) {
      const likes = await Like.find({
        userId: req.user._id,
        postId: { $in: posts.map((p) => p._id) },
      });
      likedPostIds = likes.map((l) => l.postId.toString());
    }

    const postsWithLikeStatus = posts.map((post) => ({
      ...post.toObject(),
      isLiked: likedPostIds.includes(post._id.toString()),
    }));

    res.json({
      posts: postsWithLikeStatus,
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

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Get a single post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post details
 *       404:
 *         description: Post not found
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      'userId',
      'username profileImage'
    );

    if (!post) {
      throw new ApiError('Post not found', 404);
    }

    let isLiked = false;
    if (req.user) {
      const like = await Like.findOne({
        postId: post._id,
        userId: req.user._id,
      });
      isLiked = !!like;
    }

    res.json({
      ...post.toObject(),
      isLiked,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - code
 *               - language
 *             properties:
 *               title:
 *                 type: string
 *               code:
 *                 type: string
 *               language:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Post created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = createPostSchema.safeParse(req.body);

      if (!validation.success) {
        // Delete uploaded file if validation fails
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError(validation.error.errors[0].message, 400);
      }

      const { title, code, language, description } = validation.data;

      const post = new Post({
        userId: req.user!._id,
        title,
        code,
        language: language.toLowerCase(),
        description,
        image: req.file ? `/uploads/${req.file.filename}` : null,
      });

      await post.save();
      await post.populate('userId', 'username profileImage');

      res.status(201).json({
        message: 'Post created successfully',
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/posts/{id}:
 *   put:
 *     summary: Update a post
 *     tags: [Posts]
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
 *         description: Post updated successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Post not found
 */
router.put(
  '/:id',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const post = await Post.findById(req.params.id);

      if (!post) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError('Post not found', 404);
      }

      if (post.userId.toString() !== req.user!._id.toString()) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError('Not authorized to update this post', 403);
      }

      const validation = updatePostSchema.safeParse(req.body);

      if (!validation.success) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw new ApiError(validation.error.errors[0].message, 400);
      }

      const updates = validation.data;

      // Update fields
      if (updates.title) post.title = updates.title;
      if (updates.code) post.code = updates.code;
      if (updates.language) post.language = updates.language.toLowerCase();
      if (updates.description !== undefined) post.description = updates.description;

      // Handle image update
      if (req.file) {
        // Delete old image
        if (post.image) {
          const oldPath = path.join(__dirname, '../..', post.image);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        post.image = `/uploads/${req.file.filename}`;
      }

      await post.save();
      await post.populate('userId', 'username profileImage');

      res.json({
        message: 'Post updated successfully',
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/posts/{id}:
 *   delete:
 *     summary: Delete a post
 *     tags: [Posts]
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
 *         description: Post deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Post not found
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      throw new ApiError('Post not found', 404);
    }

    if (post.userId.toString() !== req.user!._id.toString()) {
      throw new ApiError('Not authorized to delete this post', 403);
    }

    // Delete image if exists
    if (post.image) {
      const imagePath = path.join(__dirname, '../..', post.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Post.findByIdAndDelete(req.params.id);

    // Delete associated likes
    await Like.deleteMany({ postId: req.params.id });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
