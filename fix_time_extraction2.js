import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const regexStr = `/\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4}\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|ص|م)?/i`;
const regexNewStr = `/(?:\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}\\s+|)\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|ص|م|am|pm)?/ig`;

const searchStr = `                            // Highly forgiving regex that matches:
                            // 26/04/2026 10:00 AM
                            // 26-04-2026 10:00AM
                            // 10:00ص
                            const timeMatch = combinedText.match(/\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4}\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|ص|م)?/i) 
                                            || combinedText.match(/\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|ص|م)?/i);
                                            
                            if (timeMatch && timeMatch[0]) {
                                extractedTicketTime = timeMatch[0];
                                broadcast(taskId, { type: 'LOG', message: \`[DEBUG] استخراج ذكي للتوقيت من التذكرة: \${extractedTicketTime}\` });
                            } else {
                                broadcast(taskId, { type: 'LOG', message: \`[DEBUG] لم يعثر الكاشف على التوقيت. سيتم استخدام توقيت السيرفر.\` });
                            }`;

const replacementStr = `                            
                            // Find all matches globally in the text
                            const regex = /(?:\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}\\s+|)\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|ص|م|am|pm)?/ig;
                            const matches = combinedText.match(regex);
                            
                            // Let's grab the final match because sometimes the system prints time locally first and the REAL ticket time is loaded last.
                            if (matches && matches.length > 0) {
                                extractedTicketTime = matches[matches.length - 1]; // Take the LAST matched time
                                broadcast(taskId, { type: 'LOG', message: \`[DEBUG] استخراج ذكي للتوقيت من التذكرة: \${extractedTicketTime}\` });
                            } else {
                                broadcast(taskId, { type: 'LOG', message: \`[DEBUG] لم يعثر الكاشف على التوقيت. النص المستخرج كان: \${combinedText.substring(0, 50)}...\` });
                            }
                            `;

content = content.replace(searchStr, replacementStr);

fs.writeFileSync('server.ts', content);
console.log('Done');
