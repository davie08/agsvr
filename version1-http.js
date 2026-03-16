/**
 * 版本1：HTTP接口方式
 * 
 * 外网Client端：
 * - POST /api/client/startAgent - 启动agent会话，创建任务
 * - GET /api/client/getAgentStatus/:taskId - 获取任务状态
 * 
 * 内网服务端：
 * - GET /api/agent/getAgentTask - 获取待执行的任务
 * - PUT /api/agent/updateAgentStatus/:taskId - 更新任务状态
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// 任务状态枚举
const TaskStatus = {
  TODO: 'todo',           // 待执行
  PROCESSING: 'processing', // 执行中
  COMPLETED: 'completed',   // 已完成
  ERROR: 'error'           // 错误
};

// 内存存储任务（生产环境应使用数据库）
const tasks = new Map();

// ==================== 外网Client端接口 ====================

/**
 * 启动Agent会话
 * POST /api/client/startAgent
 * Body: { "input": "用户输入的文本", "uuid": "可选，用于连续对话的会话ID" }
 * Response: { "taskId": "xxx", "status": "todo" }
 */
app.post('/api/client/startAgent', (req, res) => {
  const { input, uuid } = req.body;
  
  if (!input) {
    return res.status(400).json({ error: 'input参数必填' });
  }

  // 使用请求中的uuid，如果没有则生成新的
  const taskId = uuid || uuidv4();
  
  // 检查任务是否已存在
  const existingTask = tasks.get(taskId);
  
  if (existingTask) {
    // 如果任务存在且未完成，返回错误
    if (existingTask.status !== TaskStatus.COMPLETED && existingTask.status !== TaskStatus.ERROR) {
      return res.status(400).json({ 
        error: '任务正在进行中，请等待完成后再提交新任务',
        taskId: taskId,
        status: existingTask.status
      });
    }
    
    // 如果任务已完成或出错，创建新的任务（保持同一个taskId，实现连续对话）
    const task = {
      id: taskId,
      status: TaskStatus.TODO,
      input: input,
      output: null,
      createdAt: existingTask.createdAt, // 保持原始创建时间
      updatedAt: new Date().toISOString(),
      isContinuation: true // 标记为连续对话
    };
    
    tasks.set(taskId, task);
    console.log(`[Client] 连续对话任务: ${taskId}, 输入: ${input}`);
    
    return res.json({
      taskId: taskId,
      status: task.status,
      createdAt: task.createdAt,
      isContinuation: true
    });
  }

  // 新任务
  const task = {
    id: taskId,
    status: TaskStatus.TODO,
    input: input,
    output: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isContinuation: false
  };

  tasks.set(taskId, task);
  console.log(`[Client] 创建任务: ${taskId}, 输入: ${input}`);

  res.json({
    taskId: taskId,
    status: task.status,
    createdAt: task.createdAt,
    isContinuation: false
  });
});

/**
 * 获取任务状态
 * GET /api/client/getAgentStatus/:taskId
 * Response: { "taskId": "xxx", "status": "completed", "output": "AI响应", ... }
 */
app.get('/api/client/getAgentStatus/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }

  console.log(`[Client] 查询任务状态: ${taskId}, 当前状态: ${task.status}`);

  res.json({
    taskId: task.id,
    status: task.status,
    input: task.input,
    output: task.output,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  });
});

// ==================== 内网服务端接口 ====================

/**
 * 获取待执行的任务
 * GET /api/agent/getAgentTask
 * Response: { "task": { "id": "xxx", "input": "...", ... } } 或 { "task": null }
 */
app.get('/api/agent/getAgentTask', (req, res) => {
  // 查找第一个todo状态的任务
  let foundTask = null;
  for (const [id, task] of tasks) {
    if (task.status === TaskStatus.TODO) {
      // 标记为processing
      task.status = TaskStatus.PROCESSING;
      task.updatedAt = new Date().toISOString();
      foundTask = task;
      console.log(`[Agent] 获取任务: ${id}, 标记为processing`);
      break;
    }
  }

  res.json({
    task: foundTask
  });
});

/**
 * 更新任务状态
 * PUT /api/agent/updateAgentStatus/:taskId
 * Body: { "status": "completed", "output": "AI响应文本" }
 * Response: { "success": true }
 */
app.put('/api/agent/updateAgentStatus/:taskId', (req, res) => {
  const { taskId } = req.params;
  const { status, output } = req.body;

  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }

  // 更新任务
  task.status = status || task.status;
  task.output = output !== undefined ? output : task.output;
  task.updatedAt = new Date().toISOString();

  console.log(`[Agent] 更新任务: ${taskId}, 状态: ${task.status}, 输出: ${task.output}`);

  res.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      updatedAt: task.updatedAt
    }
  });
});

// ==================== 辅助接口 ====================

// 获取所有任务（用于调试）
app.get('/api/tasks', (req, res) => {
  const allTasks = Array.from(tasks.values());
  res.json({ tasks: allTasks, count: allTasks.length });
});

// 清理已完成任务
app.delete('/api/tasks/completed', (req, res) => {
  let cleaned = 0;
  for (const [id, task] of tasks) {
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.ERROR) {
      tasks.delete(id);
      cleaned++;
    }
  }
  console.log(`[System] 清理了 ${cleaned} 个已完成任务`);
  res.json({ cleaned });
});

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`HTTP版本中转服务已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`========================================`);
  console.log(`\n外网Client端接口:`);
  console.log(`  POST   http://localhost:${PORT}/api/client/startAgent`);
  console.log(`  GET    http://localhost:${PORT}/api/client/getAgentStatus/:taskId`);
  console.log(`\n内网服务端接口:`);
  console.log(`  GET    http://localhost:${PORT}/api/agent/getAgentTask`);
  console.log(`  PUT    http://localhost:${PORT}/api/agent/updateAgentStatus/:taskId`);
  console.log(`\n辅助接口:`);
  console.log(`  GET    http://localhost:${PORT}/api/tasks`);
  console.log(`  DELETE http://localhost:${PORT}/api/tasks/completed`);
  console.log(`========================================\n`);
});
