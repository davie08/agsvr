/**
 * WebSocket版本测试客户端
 * 
 * 使用方法：
 * 1. 先启动 version2-websocket.js 服务
 * 2. 在不同终端运行：node test-ws-client.js 和 node test-ws-agent.js
 */

const WebSocket = require('ws');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3001;

// ==================== 测试Client端 ====================

function testClient() {
  console.log('========== 测试Client端 ==========\n');
  console.log('连接到服务器...');

  const ws = new WebSocket(`ws://${SERVER_HOST}:${SERVER_PORT}/client`);

  ws.on('open', () => {
    console.log('已连接到服务器\n');
    
    // 创建几个任务
    setTimeout(() => {
      console.log('发送任务1...');
      ws.send(JSON.stringify({
        type: 'startAgent',
        input: '你好，请介绍一下自己'
      }));
    }, 1000);

    setTimeout(() => {
      console.log('发送任务2...');
      ws.send(JSON.stringify({
        type: 'startAgent',
        input: '今天天气怎么样？'
      }));
    }, 3000);

    setTimeout(() => {
      console.log('发送任务3...');
      ws.send(JSON.stringify({
        type: 'startAgent',
        input: '推荐一本好书'
      }));
    }, 5000);
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('\n收到消息:', message);
  });

  ws.on('error', (error) => {
    console.error('连接错误:', error);
  });

  ws.on('close', () => {
    console.log('连接关闭');
    process.exit(0);
  });

  // 30秒后关闭
  setTimeout(() => {
    console.log('\n测试完成，关闭连接...');
    ws.close();
  }, 30000);
}

// ==================== 测试Agent端 ====================

function testAgent() {
  console.log('========== 测试Agent端 ==========\n');
  console.log('连接到服务器...');

  const ws = new WebSocket(`ws://${SERVER_HOST}:${SERVER_PORT}/agent`);

  ws.on('open', () => {
    console.log('已连接到服务器');
    console.log('等待任务...\n');
  });

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'connected') {
      console.log(message.message);
    } else if (message.type === 'pendingTasks') {
      console.log(`收到 ${message.tasks.length} 个待处理任务`);
      // 处理待处理任务
      for (const task of message.tasks) {
        await processTask(ws, task);
      }
    } else if (message.type === 'newTask') {
      console.log('\n收到新任务!');
      await processTask(ws, message.task);
    } else if (message.type === 'taskUpdated') {
      console.log('任务更新确认:', message);
    } else {
      console.log('收到消息:', message);
    }
  });

  ws.on('error', (error) => {
    console.error('连接错误:', error);
  });

  ws.on('close', () => {
    console.log('连接关闭');
    process.exit(0);
  });

  // 发送心跳
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

// 处理任务
async function processTask(ws, task) {
  console.log(`\n处理任务: ${task.id}`);
  console.log(`状态: ${task.status}`);
  console.log(`输入: ${task.input}`);

  // 模拟AI处理
  console.log('处理中...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 生成响应
  const output = `AI回复: 收到你的问题"${task.input}"，这是通过WebSocket返回的回复。`;

  // 更新任务状态
  ws.send(JSON.stringify({
    type: 'updateTask',
    taskId: task.id,
    status: 'completed',
    output: output
  }));

  console.log('已发送任务完成通知');
}

// ==================== 主函数 ====================

const mode = process.argv[2];

if (mode === 'client') {
  testClient();
} else if (mode === 'agent') {
  testAgent();
} else {
  console.log('使用方法:');
  console.log('  测试Client端: node test-ws-client.js client');
  console.log('  测试Agent端:  node test-ws-client.js agent');
}
