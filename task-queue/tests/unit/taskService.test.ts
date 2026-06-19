import taskService from '../../src/services/taskService';

// ── Mock all external dependencies ──────────────────────────────────────────
jest.mock('../../src/repositories/taskRepository', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../src/queue/taskQueue', () => ({
  taskQueue: {
    add: jest.fn(),
  },
}));

jest.mock('../../src/observability/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

jest.mock('../../src/observability/metrics', () => ({
  tasksTotal: {
    inc: jest.fn(),
    dec: jest.fn(),
  },
}));

// ── Import mocks after jest.mock calls ──────────────────────────────────────
import taskRepository from '../../src/repositories/taskRepository';
import { taskQueue } from '../../src/queue/taskQueue';

const mockRepo = taskRepository as jest.Mocked<typeof taskRepository>;
const mockQueue = taskQueue as jest.Mocked<typeof taskQueue>;

// ── Shared mock task fixture ─────────────────────────────────────────────────
const mockTask = {
  id: 'test-uuid-1234',
  payload: { email: 'test@example.com' },
  status: 'pending' as const,
  priority: 0,
  attempts: 0,
  max_attempts: 3,
  error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
};

// ────────────────────────────────────────────────────────────────────────────

describe('TaskService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createTask ─────────────────────────────────────────────────────────────
  describe('createTask', () => {
    it('should create a task and enqueue it in Redis', async () => {
      mockRepo.create.mockReturnValue(mockTask);
      mockQueue.add.mockResolvedValue({} as any);

      const result = await taskService.createTask({ email: 'test@example.com' }, 5);

      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-task',
        { taskId: mockTask.id, payload: mockTask.payload },
        { jobId: mockTask.id, priority: mockTask.priority }
      );
      expect(result).toEqual(mockTask);
    });

    it('should use default priority 0 when not provided', async () => {
      mockRepo.create.mockReturnValue(mockTask);
      mockQueue.add.mockResolvedValue({} as any);

      await taskService.createTask({ key: 'value' });

      const createArg = mockRepo.create.mock.calls[0][0];
      expect(createArg.priority).toBe(0);
    });

    it('should mark task as failed and throw if Redis enqueue fails', async () => {
      mockRepo.create.mockReturnValue(mockTask);
      mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));
      mockRepo.updateStatus.mockReturnValue({ ...mockTask, status: 'failed' });

      await expect(taskService.createTask({ email: 'fail@example.com' })).rejects.toThrow(
        'Task queuing failed; transaction aborted'
      );

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'failed',
        expect.any(Object)
      );
    });
  });

  // ── getTask ────────────────────────────────────────────────────────────────
  describe('getTask', () => {
    it('should return a task when it exists', async () => {
      mockRepo.findById.mockReturnValue(mockTask);

      const result = await taskService.getTask('test-uuid-1234');

      expect(mockRepo.findById).toHaveBeenCalledWith('test-uuid-1234');
      expect(result).toEqual(mockTask);
    });

    it('should throw a 404 error when the task does not exist', async () => {
      mockRepo.findById.mockReturnValue(null);

      await expect(taskService.getTask('non-existent-id')).rejects.toMatchObject({
        message: 'Task not found',
        status: 404,
      });
    });
  });

  // ── listTasks ──────────────────────────────────────────────────────────────
  describe('listTasks', () => {
    it('should return an array of tasks', async () => {
      mockRepo.findAll.mockReturnValue([mockTask]);

      const result = await taskService.listTasks({ limit: 10, offset: 0 });

      expect(mockRepo.findAll).toHaveBeenCalledWith({ limit: 10, offset: 0 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockTask);
    });

    it('should return an empty array when no tasks match', async () => {
      mockRepo.findAll.mockReturnValue([]);

      const result = await taskService.listTasks({ status: 'completed' });

      expect(result).toEqual([]);
    });
  });

  // ── deleteTask ─────────────────────────────────────────────────────────────
  describe('deleteTask', () => {
    it('should delete a task and return true', async () => {
      mockRepo.findById.mockReturnValue(mockTask);
      mockRepo.delete.mockReturnValue(true);

      const result = await taskService.deleteTask('test-uuid-1234');

      expect(mockRepo.delete).toHaveBeenCalledWith('test-uuid-1234');
      expect(result).toBe(true);
    });

    it('should throw a 404 error when task to delete does not exist', async () => {
      mockRepo.findById.mockReturnValue(null);

      await expect(taskService.deleteTask('ghost-id')).rejects.toMatchObject({
        message: 'Task not found',
        status: 404,
      });

      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
