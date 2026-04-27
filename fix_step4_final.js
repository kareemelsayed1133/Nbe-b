import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Fix the Date and Time selection by waiting and ensuring `change` events fire for Angular/React
const selectOptionCode = `                 if (daySelect) {
                     const opts = await daySelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await daySelect.selectOption(opts[0]);
                         broadcast(taskId, { type: 'LOG', message: \`[PROCESS] تم اختيار اليوم بنجاح.\` });
                         await page.waitForTimeout(3000); // Allow time to fetch times
                     }
                 }
                 
                 if (timeSelect) {
                     const opts = await timeSelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await timeSelect.selectOption(opts[0]);
                         broadcast(taskId, { type: 'LOG', message: \`[PROCESS] تم اختيار التوقيت بنجاح.\` });
                         await page.waitForTimeout(2000);
                     }
                 }`;

const newSelectOptionCode = `                 if (daySelect) {
                     const opts = await daySelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await daySelect.selectOption(opts[0]);
                         await daySelect.evaluate((e: HTMLSelectElement) => {
                             e.dispatchEvent(new Event('change', { bubbles: true }));
                             e.dispatchEvent(new Event('blur', { bubbles: true }));
                         }).catch(()=>{});
                         broadcast(taskId, { type: 'LOG', message: \`[PROCESS] تم اختيار اليوم بنجاح.\` });
                         await page.waitForTimeout(3000); 
                     }
                 }
                 
                 if (timeSelect) {
                     const opts = await timeSelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await timeSelect.selectOption(opts[0]);
                         await timeSelect.evaluate((e: HTMLSelectElement) => {
                             e.dispatchEvent(new Event('change', { bubbles: true }));
                             e.dispatchEvent(new Event('blur', { bubbles: true }));
                         }).catch(()=>{});
                         broadcast(taskId, { type: 'LOG', message: \`[PROCESS] تم اختيار التوقيت بنجاح.\` });
                         await page.waitForTimeout(2000);
                     }
                 }`;
                 
content = content.replace(selectOptionCode, newSelectOptionCode);

// 2. Fix confirmBtn clicking - wait for it to be enabled, don't use force: true so it waits properly
const confirmBtnCode = `        const confirmBtn = targetFrame.locator('button:has-text("تنفيذ"), #Submit_btn, input[type="submit"]').first();
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click({ force: true });
        } else {
             throw new Error(\`تعذر العثور على زر تأكيد الحجز النهائي بعد اختيار الموعد.\`);
        }`;
        
const newConfirmBtnCode = `        const confirmBtn = targetFrame.locator('button:has-text("تنفيذ"), #Submit_btn, input[type="submit"]').first();
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            // Wait up to 5 seconds for the button to become enabled (not disabled)
            for (let j=0; j<10; j++) {
                const isDisabled = await confirmBtn.evaluate((el: HTMLButtonElement) => el.disabled || el.classList.contains('disabled'));
                if (!isDisabled) break;
                await page.waitForTimeout(500);
            }
            broadcast(taskId, { type: 'LOG', message: \`[PROCESS] المعالجة تمت، الضغط على تنفيذ للحصول على التذكرة النهائية...\` });
            await confirmBtn.click(); // Standard click waits for actionability
        } else {
             throw new Error(\`تعذر العثور على زر تأكيد الحجز النهائي بعد اختيار الموعد.\`);
        }`;

content = content.replace(confirmBtnCode, newConfirmBtnCode);

// 3. Fix Step 4 successIndicators! Removing .modal-content and expanding timeout because backend is slow
const validationCode = `        // --- Step 4 Validation ---
        await page.waitForTimeout(4000); 
        // Re-acquire frame in case it reloaded after submission
        targetFrame = page.frames().find(f => f.name() === 'myIFrm') || page.mainFrame();

        const successIndicators = targetFrame.locator('button:has-text("Download"), button:has-text("تحميل"), a:has-text("تحميل"), .download, :has-text("تعديل الحجز"), :has-text("الغاء الحجز"), .ticket, .modal-content, .alert-success').first();
        const isSuccess = await successIndicators.isVisible({ timeout: 5000 }).catch(() => false) || await targetFrame.locator('text=Download').count() > 0 || await targetFrame.locator('text=تحميل').count() > 0;`;

const newValidationCode = `        // --- Step 4 Validation ---
        broadcast(taskId, { type: 'LOG', message: \`[INFO] ننتظر صدور التذكرة النهائية من الموقع (قد يستغرق بعض الوقت)...\` });
        await page.waitForTimeout(5000); 
        // Re-acquire frame in case it reloaded after submission
        targetFrame = page.frames().find(f => f.name() === 'myIFrm') || page.mainFrame();

        // STRICT indicators mapping to the ACTUAL printed ticket. Removed .modal-content, .alert-success
        const successIndicators = targetFrame.locator('button:has-text("Download"), button:has-text("تحميل"), a:has-text("تحميل"), .download, :has-text("تعديل الحجز"), :has-text("الغاء الحجز")').first();
        const fallbackTicketIndicator = targetFrame.locator('text="سحب نقدي", text="برجاء التواجد بالفرع", text="15 دقيقة"').first();
        
        // Wait gracefully up to 15 seconds for the ticket payload to appear
        const isSuccess = await successIndicators.isVisible({ timeout: 15000 }).catch(() => false) 
                          || await fallbackTicketIndicator.isVisible({ timeout: 5000 }).catch(() => false);
        
        targetFrame = page.frames().find(f => f.name() === 'myIFrm') || page.mainFrame();`;

content = content.replace(validationCode, newValidationCode);

fs.writeFileSync('server.ts', content);
console.log('Fixed Step 4 logical errors!');
