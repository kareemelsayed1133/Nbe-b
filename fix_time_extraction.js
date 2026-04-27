import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const searchRegexString = `                        try {
                            // Attempt to extract the text explicitly from the ticket frame before screenshotting
                            const ticketText = await finalLocator.innerText({ timeout: 3000 }).catch(() => '');
                            const timeMatch = ticketText.match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s\\d{1,2}:\\d{2}\\s(?:AM|PM|ص|م|am|pm)/i) 
                                            || ticketText.match(/\\d{1,2}:\\d{2}\\s(?:AM|PM|ص|م|am|pm)/i);
                            if (timeMatch && timeMatch[0]) {
                                extractedTicketTime = timeMatch[0];
                            }
                        } catch(e) {}`;

const replacementString = `                        try {
                            // Attempt to extract the text from the entire iframe and page to ensure no weird elements hide the text
                            const fullContent = await page.evaluate(() => document.body.innerText).catch(() => '');
                            const frameContent = await targetFrame.evaluate(() => document.body.innerText).catch(() => '');
                            const combinedText = (fullContent + " " + frameContent).replace(/\\s+/g, ' ');
                            
                            // Highly forgiving regex that matches:
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
                            }
                        } catch(e) {
                            broadcast(taskId, { type: 'LOG', message: \`[DEBUG] خطأ في كاشف التوقيت: \${e.message}\` });
                        }`;

if (!content.includes(searchRegexString)) {
    console.log('Search string not found!');
}

content = content.replace(searchRegexString, replacementString);

fs.writeFileSync('server.ts', content);
console.log('Time extraction logic updated and broadened.');
