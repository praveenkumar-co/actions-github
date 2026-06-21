import './setupEnv';
import request from 'supertest';
import app from '../../src/app';
import { getDb } from '../../src/db/client';
import { migrate } from '../../src/db/migrate';
import { getRedisConnection, getRedisOptions } from '../../src/queue/client';
import { taskQueue } from '../../src/queue/taskQueue';
import { Worker } from 'bullmq';
import { taskProcessor } from '../../worker/processors/taskProcessor';
import config from '../../src/config';
import fs from 'fs';
import path from 'path';

describe('Task Queue Integration Test Suite', () => {
  let redisClient: any;
  let db: any;

  beforeAll(async () => {
    // 1. Run migrations on the test database
    migrate();
    db = getDb();
    redisClient = getRedisConnection();
    // Wait for Redis connection to be ready
    await redisClient.ping();
  });

  afterAll(async () => {
    // 1. Close BullMQ Queue connection
    await taskQueue.close();
    // 2. Cleanly close database connection
    if (db) {
      db.close();
    }
    // 3. Cleanly quit Redis connection
    if (redisClient) {
      await redisClient.quit();
    }
    // 4. Remove the test database file
    const dbFilePath = path.resolve(config.db.path);
    if (fs.existsSync(dbFilePath)) {
      try {
        fs.unlinkSync(dbFilePath);
      } catch (err) {
        // ignore errors if file is locked
      }
    }
  });

  beforeEach(async () => {
    // Clear all tasks from test database
    db.prepare('DELETE FROM tasks').run();
    // Clear all keys from test Redis
    await redisClient.flushdb();
  });

  describe('API Endpoints', () => {
    it('should create a task and return 201', async () => {
      const response = await request(app)
        .post('/tasks')
        .send({ payload: { action: 'test-email' }, priority: 10 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('pending');
      expect(response.body.priority).toBe(10);

      // Verify it was stored in the database
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(response.body.id);
      expect(row).toBeDefined();
      expect(row.priority).toBe(10);
      expect(JSON.parse(row.payload)).toEqual({ action: 'test-email' });
    });

    it('should return 400 if payload is missing or invalid', async () => {
      const response = await request(app)
        .post('/tasks')
        .send({ priority: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Payload must be a non-empty JSON object');
    });

    it('should list tasks with pagination', async () => {
      // Create test tasks
      db.prepare("INSERT INTO tasks (id, payload, status, priority) VALUES ('task-1', '{}', 'pending', 0)").run();
      db.prepare("INSERT INTO tasks (id, payload, status, priority) VALUES ('task-2', '{}', 'completed', 0)").run();

      const response = await request(app).get('/tasks');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      const filteredResponse = await request(app).get('/tasks?status=completed');
      expect(filteredResponse.status).toBe(200);
      expect(filteredResponse.body).toHaveLength(1);
      expect(filteredResponse.body[0].id).toBe('task-2');
    });

    it('should retrieve a specific task', async () => {
      db.prepare("INSERT INTO tasks (id, payload, status, priority) VALUES ('task-123', '{\"test\":true}', 'pending', 0)").run();

      const response = await request(app).get('/tasks/task-123');
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('task-123');
      expect(response.body.payload).toEqual({ test: true });
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app).get('/tasks/non-existent');
      expect(response.status).toBe(404);
    });

    it('should delete a task', async () => {
      db.prepare("INSERT INTO tasks (id, payload, status, priority) VALUES ('task-del', '{}', 'pending', 0)").run();

      const response = await request(app).delete('/tasks/task-del');
      expect(response.status).toBe(204);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-del');
      expect(row).toBeUndefined();
    });
  });

  describe('End-to-End Worker Processing', () => {
    it('should process the task and update status to completed', async () => {
      // 1. Submit a task via the API
      const createResponse = await request(app)
        .post('/tasks')
        .send({ payload: { type: 'video-encode', durationMs: 100 }, priority: 1 });

      const taskId = createResponse.body.id;

      // 2. Start the real worker processor on test queue
      const workerConnection = getRedisOptions();
      const testWorker = new Worker(config.queue.name, taskProcessor, {
        connection: workerConnection,
      });

      // 3. Wait for the job to complete
      await new Promise<void>((resolve) => {
        testWorker.on('completed', (job) => {
          if (job.data.taskId === taskId) {
            resolve();
          }
        });
      });

      // 4. Close the worker
      await testWorker.close();

      // 5. Verify the task status in the database is completed
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      expect(row.status).toBe('completed');
      expect(row.completed_at).not.toBeNull();
    });
  });
});
