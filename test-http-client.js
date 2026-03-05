/**
 * HTTP版本测试客户端
 * 
 * 使用方法：
 * 1. 先启动 version1-http.js 服务
 * 2. 在不同终端运行：node test-http-client.js 和 node test-http-agent.js
 */

const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3000;

// HTTP请求封装
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ==================== 测试Client端 ====================

async function testClient() {
  console.log('========== 测试Client端 ==========\n');

  // 1. 启动Agent
  console.log('1. 启动Agent...');
  const startResult = await httpRequest('POST', '/api/client/startAgent', {
    input: '你好，请介绍一下自己'
  });
  console.log('创建任务:', startResult);
  const taskId = startResult.taskId;

  // 2. 轮询任务状态
  console.log('\n2. 开始轮询任务状态...');
  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    
    const status = await httpRequest('GET', `/api/client/getAgentStatus/${taskId}`);
    console.log(`[${attempts + 1}] 状态: ${status.status}`);
    
    if (status.status === 'completed' || status.status === 'error') {
      console.log('\n任务完成！');
      console.log('输入:', status.input);
      console.log('输出:', status.output);
      break;
    }
    
    attempts++;
  }

  if (attempts >= maxAttempts) {
    console.log('任务超时');
  }

  // 3. 测试多个任务
  console.log('\n\n3. 测试批量任务...');
  const tasks = await Promise.all([
    httpRequest('POST', '/api/client/startAgent', { input: '任务1：今天天气如何？' }),
    httpRequest('POST', '/api/client/startAgent', { input: '任务2：推荐一本书' }),
    httpRequest('POST', '/api/client/startAgent', { input: '任务3：写一首诗' })
  ]);
  
  console.log('创建的3个任务:');
  tasks.forEach((t, i) => {
    console.log(`  任务${i + 1}: ${t.taskId}`);
  });
}

// ==================== 测试Agent端 ====================

async function testAgent() {
  console.log('========== 测试Agent端 ==========\n');
  console.log('开始轮询任务...\n');

  // 持续获取并执行任务
  let taskCount = 0;
  const maxTasks = 10;

  while (taskCount < maxTasks) {
    // 获取任务
    const result = await httpRequest('GET', '/api/agent/getAgentTask');
    
    if (result.task) {
      const task = result.task;
      console.log(`\n获取到任务: ${task.id}`);
      console.log(`输入: ${task.input}`);

      // 模拟处理任务（这里应该是调用实际的AI服务）
      console.log('处理中...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟处理时间

      // 生成响应
      const output = `AI回复: 收到你的问题"${task.input}"，这是模拟的回复内容。`;
      
      // 更新任务状态
      const updateResult = await httpRequest('PUT', `/api/agent/updateAgentStatus/${task.id}`, {
        status: 'completed',
        output: output
      });
      
      console.log('任务完成:', updateResult);
      taskCount++;
    } else {
      // 没有任务，等待
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n\n共处理了 ${taskCount} 个任务`);
}

// ==================== 主函数 ====================

const mode = process.argv[2];

if (mode === 'client') {
  testClient().catch(console.error);
} else if (mode === 'agent') {
  testAgent().catch(console.error);
} else {
  console.log('使用方法:');
  console.log('  测试Client端: node test-http-client.js client');
  console.log('  测试Agent端:  node test-http-client.js agent');
}
