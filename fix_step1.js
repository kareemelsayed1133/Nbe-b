import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Remove Email Filling Logic
const emailLogicStartRegex = /\/\/ 3\. Fill Email \(Optional\)[\s\S]*?(?=stepScreenshot = await page\.screenshot)/;
content = content.replace(emailLogicStartRegex, `// 3. Email input intentionally skipped per user request\n\n        `);

// 2. Refactor Step 1 Next Button and Validation
const validationLogicStartMatch = `        // Click Next/Execute ("تنفيذ")
        // The debug logs show the submit button is an input with id="Submit_btn"
        const nextBtn1 = targetFrame.locator('#Submit_btn, input[type="submit"]').first();
        if (await nextBtn1.isVisible({ timeout: 5000 })) {
            await nextBtn1.click();
            await page.waitForTimeout(3000);
        } else {
            // Fallback if ID is not found
            const fallbackBtn = targetFrame.locator('button:has-text("تنفيذ"), button:has-text("التالي"), button:has-text("استمرار")').first();
            if (await fallbackBtn.isVisible()) {
                await fallbackBtn.click();
                await page.waitForTimeout(3000);
            }
        }

        // --- Step 1 Validation ---
        // Check for specific error messages like "الخدمة غير متاحة للعملاء الأجانب"
        const foreignCustomerError = await targetFrame.locator('text="الخدمة غير متاحة للعملاء الأجانب"').isVisible();
        if (foreignCustomerError) {
            throw new Error('رفض النظام: الخدمة غير متاحة للعملاء الأجانب وستكون متاحة قريبا.');
        }

        // Check for invalid national ID error
        const invalidNationalIdError = await targetFrame.locator('text="من فضلك ادخل الرقم القومي بشكل صحيح"').isVisible();
        if (invalidNationalIdError) {
            throw new Error('رفض النظام: من فضلك ادخل الرقم القومي بشكل صحيح.');
        }

        // Check for general error messages (alerts, toasts, etc.)
        const errorLocators = targetFrame.locator('.alert-danger, .error-message, mat-error, snack-bar-container, .toast-message, [role="alert"], span[style*="color: red"], span[style*="color:red"]');
        if (await errorLocators.count() > 0 && await errorLocators.first().isVisible()) {
            const errText = await errorLocators.first().innerText();
            if (errText && errText.trim().length > 0) {
                throw new Error(\`رسالة خطأ من الموقع في خطوة إدخال البيانات: \${errText.trim()}\`);
            }
        }

        // Verify transition to Step 2
        const categoryDropdowns = targetFrame.locator('select');
        const customCategoryDropdowns = targetFrame.locator('mat-select, .dropdown-toggle, [role="combobox"]');
        
        try {
            // Wait up to 10 seconds for ANY dropdown to appear indicating step 2 loaded
            await Promise.race([
                categoryDropdowns.first().waitFor({ state: 'visible', timeout: 10000 }),
                customCategoryDropdowns.first().waitFor({ state: 'visible', timeout: 10000 })
            ]);
        } catch (e) {
            throw new Error('لم ينتقل الموقع للخطوة الثانية بعد النقر على تنفيذ (قد يكون الموقع معلقاً أو البيانات غير صحيحة).');
        }`;

const newValidationLogic = `        // Click Next/Execute ("تنفيذ")
        const nextBtn1 = targetFrame.locator('#Submit_btn, input[type="submit"]').first();
        if (await nextBtn1.isVisible({ timeout: 5000 })) {
            await nextBtn1.click();
            broadcast(taskId, { type: 'LOG', message: \`[INFO] تم النقر، ننتظر معالجة بيانات العميل...\` });
        } else {
            const fallbackBtn = targetFrame.locator('button:has-text("تنفيذ"), button:has-text("التالي"), button:has-text("استمرار")').first();
            if (await fallbackBtn.isVisible()) await fallbackBtn.click();
        }

        // --- Step 1 Validation & Wait ---
        // The site may take a long time processing (shows "جاري المعالجة...").
        // We will poll for up to 30 seconds checking for either:
        // 1. Errors on the screen
        // 2. The appearance of Step 2 dropdowns
        
        const categoryDropdowns = targetFrame.locator('select');
        const customCategoryDropdowns = targetFrame.locator('mat-select, .dropdown-toggle, [role="combobox"]');
        
        let foundError = null;
        let transitioned = false;

        for (let i = 0; i < 15; i++) { // 15 loops * 2s = 30s max wait
            await page.waitForTimeout(2000);
            
            // Re-read screenshot dynamically if an error happens later
            
            // Check for specific error partial texts
            if (await targetFrame.locator('text="العملاء الأجانب"').isVisible() || await targetFrame.locator('text="الأجانب"').isVisible()) {
                foundError = 'رفض النظام: الخدمة غير متاحة للعملاء الأجانب في الوقت الحالي.';
                break;
            }
            if (await targetFrame.locator('text="بشكل صحيح"').isVisible()) {
                foundError = 'رفض النظام: الرقم القومي المدخل غير صحيح.';
                break;
            }

            // Check for general error messages
            const errorLocators = targetFrame.locator('.alert-danger, .error-message, mat-error, snack-bar-container, .toast-message, [role="alert"], span[style*="color: red"], span[style*="color:red"]');
            if (await errorLocators.count() > 0 && await errorLocators.first().isVisible()) {
                const errText = await errorLocators.first().innerText();
                // Avoid false positives like "(اختياري)" which has red text sometimes
                if (errText && errText.trim().length > 0 && !errText.includes('اختياري')) {
                    foundError = \`رسالة خطأ من الموقع: \${errText.trim()}\`;
                    break;
                }
            }

            // Check if step 2 loaded
            if ((await categoryDropdowns.count() > 0 && await categoryDropdowns.first().isVisible()) || 
                (await customCategoryDropdowns.count() > 0 && await customCategoryDropdowns.first().isVisible())) {
                transitioned = true;
                break; 
            }
        }

        if (foundError) {
            throw new Error(foundError);
        }

        if (!transitioned) {
             throw new Error('انتهى وقت الانتظار (الموقع معلق في "جاري المعالجة...").');
        }`;

content = content.replace(validationLogicStartMatch, newValidationLogic);

fs.writeFileSync('server.ts', content);
console.log('Step 1 validation refactored to wait up to 30 seconds for slow processing and correctly catch partial errors. Email input skipped.');
