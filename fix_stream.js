import fs from 'fs';

let serverContent = fs.readFileSync('server.ts', 'utf8');

// Fix server to send FAILED event
serverContent = serverContent.replace(
  "broadcast(taskId, { type: 'LOG', message: \`❌ حدث خطأ في النظام: \${error.message}\` });\n    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('failed', taskId);",
  "broadcast(taskId, { type: 'LOG', message: \`❌ حدث خطأ في النظام: \${error.message}\` });\n    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('failed', taskId);\n    broadcast(taskId, { type: 'FAILED' });"
);

// Gracefully close connection on server side too
const closeSSECode = `
app.get('/api/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = db.prepare('SELECT status, total FROM tasks WHERE id = ?').get(taskId) as any;

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // ensure headers are sent

  if (!sseClients.has(taskId)) {
      sseClients.set(taskId, []);
  }
  sseClients.get(taskId).push(res);

  // Send initial state (progress is tracked in job_results)
  const completed = db.prepare('SELECT count(*) as count FROM job_results WHERE task_id = ? AND status = ?').get(taskId, 'success') as any;
  res.write(\`data: \${JSON.stringify({ type: 'INIT', progress: completed.count || 0, total: task.total })}\\n\\n\`);

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(':ping\\n\\n');
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    const clients = sseClients.get(taskId) || [];
    sseClients.set(taskId, clients.filter((client: any) => client !== res));
  });
});`;

const searchSSECode = `app.get('/api/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = db.prepare('SELECT status, total FROM tasks WHERE id = ?').get(taskId) as any;

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!sseClients.has(taskId)) {
      sseClients.set(taskId, []);
  }
  sseClients.get(taskId).push(res);

  // Send initial state (progress is tracked in job_results)
  const completed = db.prepare('SELECT count(*) as count FROM job_results WHERE task_id = ? AND status = ?').get(taskId, 'success') as any;
  res.write(\`data: \${JSON.stringify({ type: 'INIT', progress: completed.count || 0, total: task.total })}\\n\\n\`);

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(':ping\\n\\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    const clients = sseClients.get(taskId) || [];
    sseClients.set(taskId, clients.filter((client: any) => client !== res));
  });
});`;

serverContent = serverContent.replace(searchSSECode, closeSSECode);


fs.writeFileSync('server.ts', serverContent);

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Handle FAILED event
appContent = appContent.replace(
  "        } else if (data.type === 'COMPLETE') {\n          setStatus('completed');",
  "        } else if (data.type === 'COMPLETE') {\n          setStatus('completed');"
).replace(
  "          setLogs(prev => [...prev, '[SUCCESS] تم الانتهاء من جميع العمليات!']);\n          eventSource.close();\n        }\n      } catch (err: any) {",
  "          setLogs(prev => [...prev, '[SUCCESS] تم الانتهاء من جميع العمليات!']);\n          eventSource.close();\n        } else if (data.type === 'FAILED') {\n          setStatus('error');\n          setLogs(prev => [...prev, '[ERROR] توقفت المهمة بسبب خطأ حرج (راجع السجلات).']);\n          eventSource.close();\n        }\n      } catch (err: any) {"
);

fs.writeFileSync('src/App.tsx', appContent);
console.log('Fixed stream handling!');
