# Agent Relay Server - AI服务中转服务

这是一个用于内网AI服务与外网客户端通信的中转服务。支持HTTP和WebSocket两种通信方式。

## 项目结构

```
agentsvr/
├── package.json              # 项目配置
├── version1-http.js          # HTTP版本服务
├── version2-websocket.js     # WebSocket版本服务
├── test-http-client.js       # HTTP版本测试客户端
├── test-ws-client.js         # WebSocket版本测试客户端
└── README.md                 # 本文档
```

## 安装依赖

```bash
npm install
```

## 版本1：HTTP接口方式

### 启动服务

```bash
npm run start:http
# 或
node version1-http.js
```

服务将在 `http://localhost:3000` 启动

### API接口

#### 外网Client端接口

**1. 启动Agent（创建任务）**
```bash
POST /api/client/startAgent
Content-Type: application/json

{
  "input": "你好，请介绍一下自己"
}

# 响应
{
  "taskId": "xxx-xxx-xxx",
  "status": "todo",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**2. 获取任务状态**
```bash
GET /api/client/getAgentStatus/:taskId

# 响应
{
  "taskId": "xxx-xxx-xxx",
  "status": "completed",
  "input": "你好，请介绍一下自己",
  "output": "AI回复内容...",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:05.000Z"
}
```

#### 内网服务端接口

**1. 获取待执行任务**
```bash
GET /api/agent/getAgentTask

# 响应（有任务时）
{
  "task": {
    "id": "xxx-xxx-xxx",
    "status": "processing",
    "input": "你好，请介绍一下自己",
    "output": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:01.000Z"
  }
}

# 响应（无任务时）
{
  "task": null
}
```

**2. 更新任务状态**
```bash
PUT /api/agent/updateAgentStatus/:taskId
Content-Type: application/json

{
  "status": "completed",
  "output": "AI回复内容..."
}

# 响应
{
  "success": true,
  "task": {
    "id": "xxx-xxx-xxx",
    "status": "completed",
    "updatedAt": "2024-01-01T00:00:05.000Z"
  }
}
```

#### 辅助接口

```bash
# 查看所有任务
GET /api/tasks

# 清理已完成任务
DELETE /api/tasks/completed
```

### 测试方法

**方式1：使用测试脚本**

打开两个终端：

终端1（运行Agent）：
```bash
node test-http-client.js agent
```

终端2（运行Client）：
```bash
node test-http-client.js client
```

**方式2：使用curl命令**

终端1（创建任务）：
```bash
# 创建任务
curl -X POST http://localhost:3000/api/client/startAgent \
  -H "Content-Type: application/json" \
  -d '{"input":"你好"}'

# 查询任务状态（替换TASK_ID为上面返回的taskId）
curl http://localhost:3000/api/client/getAgentStatus/TASK_ID
```

终端2（执行任务）：
```bash
# 获取任务
curl http://localhost:3000/api/agent/getAgentTask

# 更新任务状态（替换TASK_ID）
curl -X PUT http://localhost:3000/api/agent/updateAgentStatus/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","output":"你好！我是AI助手"}'
```

---

## 版本2：WebSocket方式

### 启动服务

```bash
npm run start:ws
# 或
node version2-websocket.js
```

服务将在 `ws://localhost:3001` 启动

### 连接地址

- **外网Client端**: `ws://localhost:3001/client`
- **内网Agent端**: `ws://localhost:3001/agent`
- **状态查看**: `http://localhost:3002/status`
- **任务列表**: `http://localhost:3002/tasks`

### 消息格式

#### 外网Client端消息

**发送任务**
```json
{
  "type": "startAgent",
  "input": "你好，请介绍一下自己"
}
```

**接收消息**
```json
// 任务创建确认
{
  "type": "taskCreated",
  "taskId": "xxx-xxx-xxx",
  "status": "todo",
  "createdAt": "2024-01-01T00:00:00.000Z"
}

// 任务状态更新
{
  "type": "taskStatus",
  "taskId": "xxx-xxx-xxx",
  "status": "completed",
  "input": "你好",
  "output": "AI回复内容...",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:05.000Z"
}
```

#### 内网Agent端消息

**接收任务**
```json
// 新任务通知
{
  "type": "newTask",
  "task": {
    "id": "xxx-xxx-xxx",
    "status": "todo",
    "input": "你好",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}

// 待处理任务列表（连接时发送）
{
  "type": "pendingTasks",
  "tasks": [...]
}
```

**更新任务状态**
```json
{
  "type": "updateTask",
  "taskId": "xxx-xxx-xxx",
  "status": "completed",
  "output": "AI回复内容..."
}
```

### 测试方法

打开两个终端：

终端1（运行Agent）：
```bash
node test-ws-client.js agent
```

终端2（运行Client）：
```bash
node test-ws-client.js client
```

---

## 任务状态说明

| 状态 | 说明 |
|------|------|
| `todo` | 待执行，任务已创建等待内网服务处理 |
| `processing` | 执行中，内网服务已获取任务正在处理 |
| `completed` | 已完成，任务执行成功并返回结果 |
| `error` | 错误，任务执行失败 |

---

## 实际使用示例

### HTTP版本 - 内网服务实现示例

```javascript
const http = require('http');

// 轮询获取任务
async function pollTask() {
  const task = await httpRequest('GET', '/api/agent/getAgentTask');
  
  if (task) {
    // 调用你的AI服务处理任务
    const output = await yourAIChat(task.input);
    
    // 更新任务状态
    await httpRequest('PUT', `/api/agent/updateAgentStatus/${task.id}`, {
      status: 'completed',
      output: output
    });
  }
}

// 每500ms轮询一次
setInterval(pollTask, 500);
```

### WebSocket版本 - 内网服务实现示例

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://your-server:3001/agent');

ws.on('open', () => {
  console.log('已连接到中转服务');
});

ws.on('message', async (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'newTask' || message.type === 'pendingTasks') {
    const tasks = message.type === 'newTask' ? [message.task] : message.tasks;
    
    for (const task of tasks) {
      // 调用你的AI服务处理任务
      const output = await yourAIChat(task.input);
      
      // 更新任务状态
      ws.send(JSON.stringify({
        type: 'updateTask',
        taskId: task.id,
        status: 'completed',
        output: output
      }));
    }
  }
});
```

---

## 注意事项

1. **生产环境建议**：当前使用内存存储任务，生产环境建议使用Redis或数据库持久化
2. **安全性**：建议添加API密钥认证，防止未授权访问
3. **HTTPS/WSS**：生产环境请使用HTTPS和WSS加密传输
4. **错误处理**：建议添加更完善的错误处理和重试机制
5. **任务超时**：建议添加任务超时处理机制

---

## 环境变量

可以设置以下环境变量：

```bash
# HTTP版本端口
PORT=3000 node version1-http.js

# WebSocket版本端口
PORT=3001 node version2-websocket.js
```

---

## License

MIT
