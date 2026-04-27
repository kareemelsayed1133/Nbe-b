import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// The replacement logic:
const searchStringClip = `                            if (box && box.width > 0 && box.height > 0) {
                                // Clamp the viewport to ensure the area is fully visible, but without triggering explicit scroll actions on the element
                                ticketShotBase64 = (await page.screenshot({ 
                                    type: 'jpeg', 
                                    quality: 60,
                                    clip: { x: box.x, y: box.y, width: box.width, height: box.height},
                                    timeout: 10000
                                })).toString('base64');
                            } else {`;

const replaceStringClip = `                            if (box && box.width > 0 && box.height > 0) {
                                // Use the locator directly to take a screenshot - handles scrolling automatically and correctly captures the entire element and its height!
                                ticketShotBase64 = (await finalLocator.screenshot({ 
                                    type: 'jpeg', 
                                    quality: 80,
                                    timeout: 10000
                                })).toString('base64');
                            } else {`;

const searchStringTelegram = `                    // Send to Telegram if configured
                    sendTelegramTicket(ticketShotBase64, \`✅ تم الحجز بنجاح!\\nالعميل: \${nationalId}\\nالفرع: \${branch || region}\\nالتوقيت: \${row['الوقت'] || ''}\`);`;

const replaceStringTelegram = `                    // Formulate cleaner text with Phone and automatic time
                    const phoneVal = row['الهاتف'] || row['رقم الموبايل'] || row['رقم الهاتف'] || row['Phone'] || 'غير متوفر';
                    const timeVal = row['الوقت'] || row['الميعاد'] || row['التوقيت'] || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    
                    // Send to Telegram if configured
                    sendTelegramTicket(ticketShotBase64, \`✅ تم الحجز بنجاح!\\nالعميل: \${nationalId}\\nالهاتف: \${phoneVal}\\nالفرع: \${branch || region}\\nالتوقيت: \${timeVal}\`);`;


content = content.replace(searchStringClip, replaceStringClip);
content = content.replace(searchStringTelegram, replaceStringTelegram);

fs.writeFileSync('server.ts', content);
console.log('Ticket screenshot and Telegram text updated!');
