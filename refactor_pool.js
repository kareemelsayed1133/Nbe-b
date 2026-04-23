import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Match the start of the loop
const startMatch = `    const browser = await Promise.race([launchPromise, timeoutPromise]) as any;
    localBroadcast({ type: 'LOG', message: '[SYSTEM] تم تشغيل المتصفح بنجاح.' });

    for (let i = 0; i < task.data.length; i++) {
        const row = task.data[i];`;

const newStart = `    const browser = await Promise.race([launchPromise, timeoutPromise]) as any;
    localBroadcast({ type: 'LOG', message: '[SYSTEM] تم تشغيل المتصفح بنجاح، جاري تفعيل العمل المتوازي (Browser Pool)...' });

    const CONCURRENCY_LIMIT = 3;
    let currentIndex = 0;
    let completedCount = 0;

    async function processNext() {
      while (currentIndex < task.data.length) {
        const i = currentIndex++;
        const row = task.data[i];`;

// Match the end of the loop
const endMatch = `      broadcast(taskId, { 
        type: 'PROGRESS', 
        progress: i + 1, 
        total: task.total,
        result: resultRow
      });
    }

    await browser.close();`;

const newEnd = `      completedCount++;
      broadcast(taskId, { 
        type: 'PROGRESS', 
        progress: completedCount, 
        total: task.total,
        result: resultRow
      });
      }
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY_LIMIT; w++) {
      workers.push(processNext());
    }
    await Promise.all(workers);

    await browser.close();`;

content = content.replace(startMatch, newStart);
content = content.replace(endMatch, newEnd);

fs.writeFileSync('server.ts', content);
console.log('Refactored to use Browser Pool!');
