import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDatabase } from './config/database';
import { swaggerSpec } from './config/swagger';
import { configurePassport } from './config/passport';
import swaggerUi from 'swagger-ui-express';
import passport from 'passport';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import likeRoutes from './routes/like.routes';
import aiRoutes from './routes/ai.routes';
import deckRoutes from './routes/deck.routes';
import welcomeSpinRoutes from './routes/welcomeSpin.routes';
import anonBuildRoutes from './routes/anonBuild.routes';
import soulRoutes from './routes/soul.routes';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:5174',
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport
configurePassport();
app.use(passport.initialize());

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', commentRoutes);
app.use('/api', likeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai', anonBuildRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/welcome-spin', welcomeSpinRoutes);
app.use('/api/soul', soulRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
