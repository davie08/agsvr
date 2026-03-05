/**
 * 版本2：WebSocket方式
 * 
 * 外网Client端：
 * - 连接 ws://host:port/client
 * - 发送: { "type": "startAgent", "input": "..." }
 * - 接收: { "type": "taskStatus", "taskId": "...", "status": "...", "output": "..." }
 * 
 * 内网服务端：
 * - 连接 ws://host:port/agent
 * - 接收: { "type": "newTask", "task": {...} }
 * - 发送: { "type": "updateTask", "taskId": "...", "status": "...", "output": "..." }
 */

const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8000;

// 任务状态枚举
const TaskStatus = {
  TODO: 'todo',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// 消息类型枚举
const MessageType = {
  // Client -> Server
  START_AGENT: 'startAgent',
  
  // Agent -> Server
  UPDATE_TASK: 'updateTask',
  
  // Server -> Client
  TASK_STATUS: 'taskStatus',
  TASK_CREATED: 'taskCreated',
  
  // Server -> Agent
  NEW_TASK: 'newTask',
  
  // 通用
  ERROR: 'error',
  PONG: 'pong'
};

// 任务存储
const tasks = new Map();

// 连接管理
const clients = new Set();  // 外网Client连接
const agents = new Set();   // 内网Agent连接

// 创建HTTP服务器
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`[WebSocket] 新连接: ${pathname}`);

  // 根据路径区分Client和Agent
  if (pathname === '/client') {
    handleClientConnection(ws);
  } else if (pathname === '/agent') {
    handleAgentConnection(ws);
  } else {
    ws.send(JSON.stringify({ type: MessageType.ERROR, message: '无效的连接路径' }));
    ws.close();
  }
});

// ==================== Client连接处理 ====================

function handleClientConnection(ws) {
  clients.add(ws);
  console.log(`[Client] 新Client连接，当前连接数: ${clients.size}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[Client] 收到消息:`, message);

      if (message.type === MessageType.START_AGENT) {
        handleStartAgent(ws, message);
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: MessageType.PONG }));
      } else {
        ws.send(JSON.stringify({ 
          type: MessageType.ERROR, 
          message: '未知的消息类型' 
        }));
      }
    } catch (error) {
      console.error('[Client] 消息解析错误:', error);
      ws.send(JSON.stringify({ 
        type: MessageType.ERROR, 
        message: '消息格式错误' 
      }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[Client] 断开连接，当前连接数: ${clients.size}`);
  });

  ws.on('error', (error) => {
    console.error('[Client] 连接错误:', error);
    clients.delete(ws);
  });

  // 发送欢迎消息
  ws.send(JSON.stringify({ 
    type: 'connected',
    message: '已连接到中转服务' 
  }));
}

function handleStartAgent(ws, message) {
  const { input } = message;
  
  if (!input) {
    return ws.send(JSON.stringify({ 
      type: MessageType.ERROR, 
      message: 'input参数必填' 
    }));
  }

  const taskId = uuidv4();
  const task = {
    id: taskId,
    status: TaskStatus.TODO,
    input: input,
    output: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  tasks.set(taskId, task);
  console.log(`[Client] 创建任务: ${taskId}`);

  // 告知Client任务已创建
  ws.send(JSON.stringify({
    type: MessageType.TASK_CREATED,
    taskId: taskId,
    status: task.status,
    createdAt: task.createdAt
  }));

  // 通知所有Agent有新任务
  notifyAgentsNewTask(task);
}

// ==================== Agent连接处理 ====================

function handleAgentConnection(ws) {
  agents.add(ws);
  console.log(`[Agent] 新Agent连接，当前连接数: ${agents.size}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[Agent] 收到消息:`, message);

      if (message.type === MessageType.UPDATE_TASK) {
        handleUpdateTask(ws, message);
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: MessageType.PONG }));
      } else {
        ws.send(JSON.stringify({ 
          type: MessageType.ERROR, 
          message: '未知的消息类型' 
        }));
      }
    } catch (error) {
      console.error('[Agent] 消息解析错误:', error);
      ws.send(JSON.stringify({ 
        type: MessageType.ERROR, 
        message: '消息格式错误' 
      }));
    }
  });

  ws.on('close', () => {
    agents.delete(ws);
    console.log(`[Agent] 断开连接，当前连接数: ${agents.size}`);
  });

  ws.on('error', (error) => {
    console.error('[Agent] 连接错误:', error);
    agents.delete(ws);
  });

  // 发送欢迎消息
  ws.send(JSON.stringify({ 
    type: 'connected',
    message: '已连接到中转服务' 
  }));

  // 发送当前所有待处理任务
  sendPendingTasks(ws);
}

function handleUpdateTask(ws, message) {
  const { taskId, status, output } = message;
  
  const task = tasks.get(taskId);
  if (!task) {
    return ws.send(JSON.stringify({ 
      type: MessageType.ERROR, 
      message: '任务不存在' 
    }));
  }

  // 更新任务
  task.status = status || task.status;
  task.output = output !== undefined ? output : task.output;
  task.updatedAt = new Date().toISOString();

  console.log(`[Agent] 更新任务: ${taskId}, 状态: ${task.status}`);

  // 确认更新
  ws.send(JSON.stringify({
    type: 'taskUpdated',
    taskId: taskId,
    status: task.status,
    updatedAt: task.updatedAt
  }));

  // 通知所有Client任务状态更新
  notifyClientsTaskUpdate(task);
}

// ==================== 通知函数 ====================

function notifyAgentsNewTask(task) {
  const message = JSON.stringify({
    type: MessageType.NEW_TASK,
    task: {
      id: task.id,
      status: task.status,
      input: task.input,
      createdAt: task.createdAt
    }
  });

  agents.forEach(agent => {
    if (agent.readyState === WebSocket.OPEN) {
      agent.send(message);
    }
  });

  console.log(`[System] 已通知 ${agents.size} 个Agent有新任务`);
}

function sendPendingTasks(ws) {
  const pendingTasks = [];
  for (const [id, task] of tasks) {
    if (task.status === TaskStatus.TODO || task.status === TaskStatus.PROCESSING) {
      pendingTasks.push({
        id: task.id,
        status: task.status,
        input: task.input,
        output: task.output,
        createdAt: task.createdAt
      });
    }
  }

  if (pendingTasks.length > 0) {
    ws.send(JSON.stringify({
      type: 'pendingTasks',
      tasks: pendingTasks
    }));
    console.log(`[System] 发送 ${pendingTasks.length} 个待处理任务给Agent`);
  }
}

function notifyClientsTaskUpdate(task) {
  const message = JSON.stringify({
    type: MessageType.TASK_STATUS,
    taskId: task.id,
    status: task.status,
    input: task.input,
    output: task.output,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(`[System] 已通知 ${clients.size} 个Client任务状态更新`);
}

// ==================== 辅助HTTP接口 ====================

// 创建简单的HTTP服务器用于查看状态
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  res.setHeader('Content-Type', 'application/json');
  
  if (url.pathname === '/status') {
    const allTasks = Array.from(tasks.values());
    res.end(JSON.stringify({
      clients: clients.size,
      agents: agents.size,
      tasks: {
        total: allTasks.length,
        todo: allTasks.filter(t => t.status === TaskStatus.TODO).length,
        processing: allTasks.filter(t => t.status === TaskStatus.PROCESSING).length,
        completed: allTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
        error: allTasks.filter(t => t.status === TaskStatus.ERROR).length
      }
    }, null, 2));
  } else if (url.pathname === '/tasks') {
    const allTasks = Array.from(tasks.values());
    res.end(JSON.stringify({ tasks: allTasks }, null, 2));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`WebSocket版本中转服务已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`========================================`);
  console.log(`\nWebSocket连接地址:`);
  console.log(`  外网Client: ws://localhost:${PORT}/client`);
  console.log(`  内网Agent:  ws://localhost:${PORT}/agent`);
  console.log(`\nHTTP状态查看:`);
  console.log(`  状态: http://localhost:${PORT}/status`);
  console.log(`  任务: http://localhost:${PORT}/tasks`);
  console.log(`========================================\n`);
});

// 启动HTTP状态服务器
const STATUS_PORT = PORT + 1;
httpServer.listen(STATUS_PORT, () => {
  console.log(`状态查看服务: http://localhost:${STATUS_PORT}/status`);
});
