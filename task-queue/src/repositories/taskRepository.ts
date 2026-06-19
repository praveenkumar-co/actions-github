// use of taskRepo is to :Query Organization: SQL queries can get long and messy. Moving them to a repository file keeps your controllers clean.
import { Database as SqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  payload: Record<string, any>;
  status: TaskStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  error?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface CreateTaskDTO {
  id: string;
  payload: Record<string, any>;
  status?: TaskStatus;
  priority?: number;
  maxAttempts?: number;
}

export interface UpdateStatusOptions {
  startedAt?: string | null;
  completedAt?: string | null;
  error?: Record<string, any> | null;
  attempts?: number;
}

class TaskRepository {
  private get db(): SqliteDatabase {
    return getDb();
  }

  private _deserializeTask(row: any): Task | null {
    if (!row) return null;
    return {
      ...row,
      payload: row.payload ? JSON.parse(row.payload) : {},
      error: row.error ? JSON.parse(row.error) : null,
    };
  }

  create(task: CreateTaskDTO): Task {
    const query = `
      INSERT INTO tasks (id, payload, status, priority, max_attempts)
      VALUES (?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(query);
    stmt.run(
      task.id,
      JSON.stringify(task.payload || {}),
      task.status || 'pending',
      task.priority || 0,
      task.maxAttempts || 3
    );

    return this.findById(task.id)!;
  }

  findById(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id);
    return this._deserializeTask(row);
  }

  updateStatus(id: string, status: TaskStatus, extraFields: UpdateStatusOptions = {}): Task {
    const updates = ['status = ?'];
    const params: any[] = [status];

    if (extraFields.startedAt !== undefined) {
      updates.push('started_at = ?');
      params.push(extraFields.startedAt);
    }
    if (extraFields.completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(extraFields.completedAt);
    }
    if (extraFields.error !== undefined) {
      updates.push('error = ?');
      params.push(extraFields.error ? JSON.stringify(extraFields.error) : null);
    }
    if (extraFields.attempts !== undefined) {
      updates.push('attempts = ?');
      params.push(extraFields.attempts);
    }

    params.push(id);

    const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(query);
    const result = stmt.run(...params);

    if (result.changes === 0) {
      throw new Error(`Task with ID ${id} not found for status update`);
    }

    return this.findById(id)!;
  }

  findAll({
    limit = 20,
    offset = 0,
    status,
  }: { limit?: number; offset?: number; status?: TaskStatus } = {}): Task[] {
    let query = 'SELECT * FROM tasks';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => this._deserializeTask(row)!);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getCountsByStatus(): { status: string; count: number }[] {
    const stmt = this.db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    return stmt.all() as { status: string; count: number }[];
  }
}

export default new TaskRepository();
