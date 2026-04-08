// Mock Anthropic SDK globally — hoisted above imports so it takes effect
// before server.ts loads the AI services
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mocked AI explanation' }],
        stop_reason: 'end_turn',
      }),
    },
  })),
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

interface TestUserResult {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    bio: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface TestPostResult {
  _id: string;
  userId: string | { _id: string; username: string; profileImage: string | null };
  title: string;
  code: string;
  language: string;
  description: string;
  likesCount: number;
  commentsCount: number;
}

let userCounter = 0;

export const createTestUser = async (
  overrides: { username?: string; email?: string; password?: string } = {}
): Promise<TestUserResult> => {
  userCounter++;
  const username = overrides.username || `testuser${userCounter}`;
  const email = overrides.email || `test${userCounter}@example.com`;
  const password = overrides.password || 'password123';

  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password });

  return {
    user: res.body.user,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
};

export const createTestPost = async (
  token: string,
  overrides: { title?: string; code?: string; language?: string; description?: string } = {}
): Promise<TestPostResult> => {
  const res = await request(app)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: overrides.title || 'Test Post',
      code: overrides.code || 'console.log("hello");',
      language: overrides.language || 'javascript',
      description: overrides.description || 'A test post',
    });

  return res.body.post;
};

export const getAuthHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});
