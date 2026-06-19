import express, { Router, Request, Response, NextFunction } from "express";
import taskService from "../services/taskService";
import { TaskStatus } from "../repositories/taskRepository";

const router: Router = express.Router();

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { payload, priority } = req.body;

    if (!payload || typeof payload !== "object") {
      return res
        .status(400)
        .json({ error: "Payload must be a non-empty JSON object" });
    }

    const task = await taskService.createTask(payload, priority || 0);
    return res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.getTask(req.params.id);
    return res.json(task);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const offset = parseInt((req.query.offset as string) || "0", 10);
    const status = req.query.status as TaskStatus | undefined;

    const tasks = await taskService.listTasks({ limit, offset, status });
    return res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await taskService.deleteTask(req.params.id);
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
