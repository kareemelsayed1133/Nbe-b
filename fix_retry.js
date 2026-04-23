import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// The replacement logic:
const searchStringTop = `      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        locale: 'ar-EG'
      });

      const page = await context.newPage();
      let status = 'فشل';
      let note = 'Unknown error';
      let currentStep = 'تهيئة المتصفح';

      try {`;

const replaceStringTop = `      let status = 'فشل';
      let note = 'Unknown error';
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          hasTouch: true,
          isMobile: true,
          locale: 'ar-EG'
        });

        const page = await context.newPage();
        let currentStep = 'تهيئة المتصفح';

        try {`;

const searchStringBottom = `      } catch (error: any) {
        const rawError = error.message || 'Error occurred';
        const friendlyError = translatePlaywrightError(rawError, currentStep);
        
        status = 'فشل';
        note = friendlyError;
        
        broadcast(taskId, { type: 'LOG', message: \`[ERROR] فشل الحجز: \${friendlyError}\` });
        broadcast(taskId, { type: 'LOG', message: \`[SYSTEM] تفاصيل الخطأ التقني: \${rawError.split('\\n')[0]}\` });
        
        try {
          // Take a detailed full-page screenshot on error
          const errorScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
          const currentUrl = page.url();
          
          broadcast(taskId, { 
            type: 'SCREENSHOT', 
            image: errorScreenshot.toString('base64'), 
            caption: \`❌ خطأ في خطوة (\${currentStep}) - الرابط: \${currentUrl.substring(0, 50)}...\`,
            isError: true
          });
        } catch (e) {
          console.error('Failed to take error screenshot', e);
        }
      } finally {
        await context.close();
      }

      const resultRow = { ...row, 'حالة الحجز': status, 'ملاحظات': note };`;

const replaceStringBottom = `          // Success break point
          break;
        } catch (error: any) {
          const rawError = error.message || 'Error occurred';
          const friendlyError = translatePlaywrightError(rawError, currentStep);
          
          status = 'فشل';
          note = friendlyError;
          
          broadcast(taskId, { type: 'LOG', message: \`[ERROR] فشل محاولة \${attempt}: \${friendlyError}\` });
          broadcast(taskId, { type: 'LOG', message: \`[SYSTEM] تفاصيل الخطأ: \${rawError.split('\\n')[0]}\` });
          
          try {
            const errorScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
            broadcast(taskId, { 
              type: 'SCREENSHOT', 
              image: errorScreenshot.toString('base64'), 
              caption: \`❌ خطأ (\${currentStep}) [محاولة \${attempt}]\`,
              isError: true
            });
          } catch (e) {}

          if (attempt < MAX_RETRIES) {
             broadcast(taskId, { type: 'LOG', message: \`⏳ إعادة محاولة الحجز للعميل (\${attempt + 1}/\${MAX_RETRIES})...\` });
          } else {
             broadcast(taskId, { type: 'LOG', message: \`❌ تم استنفاد كل المحاولات للعميل.\` });
          }
        } finally {
          await context.close();
        }
      } // End of retry loop

      const resultRow = { ...row, 'حالة الحجز': status, 'ملاحظات': note };`;

content = content.replace(searchStringTop, replaceStringTop);
content = content.replace(searchStringBottom, replaceStringBottom);

fs.writeFileSync('server.ts', content);
console.log('Retry handler implemented!');
