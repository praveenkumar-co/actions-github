import { v4 as uuidv4 } from 'uuid';
import taskRepository, { Task, TaskStatus } from '../repositories/taskRepository';
import logger from '../observability/logger';
import * as metrics from '../observability/metrics';
import { taskQueue } from '../queue/taskQueue';

interface ServiceError extends Error {
  status?: number;
}
class TaskService {
  async createTask(payload: Record<string, any>, priority = 0): Promise<Task> {
    const taskId = uuidv4();   
    const taskData = {
      id: taskId,
      payload,
      status: 'pending' as TaskStatus,
      priority,
      maxAttempts: 3
    };
    logger.info({ taskId, priority }, 'Creating task in database');
    const task = taskRepository.create(taskData);
    metrics.tasksTotal.inc({ status: 'pending' });
      try{
      await this._enqueueJob(task);
      logger.info({ taskId }, 'Task successfully enqueued in Redis');
    } catch (err: any) {
      logger.error({ taskId, err }, 'Failed to enqueue task. Marking as failed in database');
      taskRepository.updateStatus(taskId, 'failed', {
        error: { message: 'Failed to enqueue job: ' + err.message }
      });
      metrics.tasksTotal.dec({ status: 'pending' });
      metrics.tasksTotal.inc({ status: 'failed' });
      throw new Error('Task queuing failed; transaction aborted');
    }
    return task;
  }
  async getTask(id: string): Promise<Task> {
    const task = taskRepository.findById(id);
    if (!task) {
      const err: ServiceError = new Error('Task not found');
      err.status = 404;
      throw err;
    }
    return task;
  }
  async listTasks(filters: { limit?: number; offset?: number; status?: TaskStatus }): Promise<Task[]> {
    return taskRepository.findAll(filters);
  }
  async deleteTask(id: string): Promise<boolean> {
    const task = taskRepository.findById(id);
    if (!task) {
      const err: ServiceError = new Error('Task not found');
      err.status = 404;
      throw err;
    }
 const deleted = taskRepository.delete(id);
    if (deleted) {
      logger.info({ id }, 'Task deleted');
      metrics.tasksTotal.dec({ status: task.status });
    }
    return deleted;
  }
  private async _enqueueJob(task: Task): Promise<void> {
    await taskQueue.add(
      'process-task', 
      { taskId: task.id, payload: task.payload },
      {
        jobId: task.id, 
        priority: task.priority, 
      }
    );
  }
}
export default new TaskService();