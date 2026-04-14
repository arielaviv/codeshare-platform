import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';

interface TestDeckResult {
  _id: string;
  userId: string;
  title: string;
  description: string;
  theme: { palette: string; accentColor: string; fontFamily: string };
  slides: Array<{ id: string; type: string; content: Record<string, unknown> }>;
  isPublic: boolean;
}

const createTestDeck = async (
  token: string,
  overrides: Partial<{ title: string; description: string; isPublic: boolean }> = {}
): Promise<TestDeckResult> => {
  const res = await request(app)
    .post('/api/decks')
    .set(getAuthHeader(token))
    .send({
      title: overrides.title ?? 'Test Deck',
      description: overrides.description ?? 'A deck for testing',
      isPublic: overrides.isPublic ?? false,
    });

  return res.body.deck;
};

describe('GET /api/decks', () => {
  it('should return paginated decks for authenticated user', async () => {
    const { accessToken } = await createTestUser();
    await createTestDeck(accessToken, { title: 'Deck 1' });
    await createTestDeck(accessToken, { title: 'Deck 2' });

    const res = await request(app).get('/api/decks').set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.decks).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app).get('/api/decks');
    expect(res.status).toBe(401);
  });

  it('should only return decks owned by the authenticated user', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    await createTestDeck(user1.accessToken, { title: 'User1 Deck' });
    await createTestDeck(user2.accessToken, { title: 'User2 Deck' });

    const res = await request(app).get('/api/decks').set(getAuthHeader(user1.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.decks).toHaveLength(1);
    expect(res.body.decks[0].title).toBe('User1 Deck');
  });

  it('should respect page and limit params', async () => {
    const { accessToken } = await createTestUser();
    for (let i = 0; i < 5; i++) {
      await createTestDeck(accessToken, { title: `Deck ${i}` });
    }

    const res = await request(app)
      .get('/api/decks?page=1&limit=2')
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.decks).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.hasMore).toBe(true);
  });

  it('should omit slides array from list response (select -slides)', async () => {
    const { accessToken } = await createTestUser();
    await createTestDeck(accessToken);

    const res = await request(app).get('/api/decks').set(getAuthHeader(accessToken));

    expect(res.body.decks[0].slides).toBeUndefined();
  });
});

describe('POST /api/decks', () => {
  it('should create deck with valid data', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({ title: 'My Pitch Deck', description: 'Hello world' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Deck created successfully');
    expect(res.body.deck.title).toBe('My Pitch Deck');
    expect(res.body.deck.description).toBe('Hello world');
    expect(res.body.deck.slides).toEqual([]);
    expect(res.body.deck.isPublic).toBe(false);
  });

  it('should apply default theme when not provided', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({ title: 'Default theme' });

    expect(res.status).toBe(201);
    expect(res.body.deck.theme.palette).toBe('gartner-blue');
    expect(res.body.deck.theme.accentColor).toBe('#002060');
  });

  it('should accept custom theme', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'Dark deck',
        theme: {
          palette: 'dark',
          accentColor: '#ff6600',
          fontFamily: 'Inter',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.deck.theme.palette).toBe('dark');
    expect(res.body.deck.theme.accentColor).toBe('#ff6600');
  });

  it('should reject invalid hex accentColor', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'Bad theme',
        theme: { palette: 'dark', accentColor: 'red', fontFamily: 'Inter' },
      });

    expect(res.status).toBe(400);
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app).post('/api/decks').send({ title: 'No Auth' });
    expect(res.status).toBe(401);
  });

  it('should reject missing title', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({ description: 'No title here' });

    expect(res.status).toBe(400);
  });

  it('should reject title exceeding 200 characters', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({ title: 'x'.repeat(201) });

    expect(res.status).toBe(400);
  });

  it('should accept slides array with typed content', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'With slides',
        slides: [
          { id: 's1', type: 'title', content: { heading: 'Hi', subtitle: 'World' } },
          { id: 's2', type: 'bullets', content: { heading: 'Points', items: ['a', 'b'] } },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.deck.slides).toHaveLength(2);
    expect(res.body.deck.slides[0].type).toBe('title');
  });

  it('should reject invalid slide type', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({
        title: 'Bad slide',
        slides: [{ id: 's1', type: 'unknown-type', content: {} }],
      });

    expect(res.status).toBe(400);
  });

  it('should reject decks with more than 50 slides', async () => {
    const { accessToken } = await createTestUser();
    const slides = Array.from({ length: 51 }, (_, i) => ({
      id: `s${i}`,
      type: 'bullets',
      content: { heading: `Slide ${i}`, items: [] },
    }));

    const res = await request(app)
      .post('/api/decks')
      .set(getAuthHeader(accessToken))
      .send({ title: 'Too many', slides });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/decks/:id', () => {
  it('should return own deck with isOwner true', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .get(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.deck.title).toBe('Test Deck');
    expect(res.body.isOwner).toBe(true);
  });

  it('should return 403 for non-owner on private deck', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const deck = await createTestDeck(user1.accessToken, { isPublic: false });

    const res = await request(app)
      .get(`/api/decks/${deck._id}`)
      .set(getAuthHeader(user2.accessToken));

    expect(res.status).toBe(403);
  });

  it('should allow public deck to be read by anyone (no auth)', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken, { isPublic: true });

    const res = await request(app).get(`/api/decks/${deck._id}`);

    expect(res.status).toBe(200);
    expect(res.body.deck.isPublic).toBe(true);
    expect(res.body.isOwner).toBe(false);
  });

  it('should return 403 for private deck with no auth', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken, { isPublic: false });

    const res = await request(app).get(`/api/decks/${deck._id}`);

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent deck', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/decks/${fakeId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/decks/:id', () => {
  it('should update own deck', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken))
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.deck.title).toBe('Updated Title');
  });

  it('should update slides array', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken))
      .send({
        slides: [
          { id: 's1', type: 'title', content: { heading: 'New' } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.deck.slides).toHaveLength(1);
    expect(res.body.deck.slides[0].type).toBe('title');
  });

  it('should toggle isPublic', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken, { isPublic: false });

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken))
      .send({ isPublic: true });

    expect(res.status).toBe(200);
    expect(res.body.deck.isPublic).toBe(true);
  });

  it('should reject update from different user (403)', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const deck = await createTestDeck(user1.accessToken);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(getAuthHeader(user2.accessToken))
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .send({ title: 'No auth' });

    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent deck', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .put(`/api/decks/${fakeId}`)
      .set(getAuthHeader(accessToken))
      .send({ title: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('should reject invalid input (title too long)', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken))
      .send({ title: 'x'.repeat(201) });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/decks/:id', () => {
  it('should delete own deck', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app)
      .delete(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deck deleted successfully');

    const getRes = await request(app)
      .get(`/api/decks/${deck._id}`)
      .set(getAuthHeader(accessToken));
    expect(getRes.status).toBe(404);
  });

  it('should reject delete from different user (403)', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const deck = await createTestDeck(user1.accessToken);

    const res = await request(app)
      .delete(`/api/decks/${deck._id}`)
      .set(getAuthHeader(user2.accessToken));

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent deck', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .delete(`/api/decks/${fakeId}`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(404);
  });

  it('should reject unauthenticated request', async () => {
    const { accessToken } = await createTestUser();
    const deck = await createTestDeck(accessToken);

    const res = await request(app).delete(`/api/decks/${deck._id}`);

    expect(res.status).toBe(401);
  });
});
