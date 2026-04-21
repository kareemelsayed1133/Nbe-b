import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Auth fix endpoint
app.get('/api/auth-fix', (req, res) => {
  res.send('<h1>✅ تم إصلاح الاتصال!</h1><p>يمكنك الآن العودة للتطبيق وبدء الأتمتة. سيتم إغلاق هذه النافذة تلقائياً...</p><script>setTimeout(() => window.close(), 2000)</script>');
});

app.get('/api/auth-status', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Mobile-specific redirect fix
app.get('/api/mobile-fix', (req, res) => {
  const returnTo = (req.query.returnTo as string) || '/';
  res.send(`
    <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f7f6; text-align: center; padding: 20px; }
          .card { background: white; padding: 30px; border-radius: 20px; shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid #007a33; }
          h1 { color: #007a33; margin-bottom: 10px; }
          p { color: #666; }
          .loader { border: 4px solid #f3f3f3; border-top: 4px solid #007a33; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(3600deg); } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ تم تفعيل الاتصال!</h1>
          <p>جاري إعادتك للتطبيق الآن...</p>
          <div class="loader"></div>
          <a href="${returnTo}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007a33; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">اضغط هنا إذا لم يتم تحويلك تلقائياً</a>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = "${returnTo}";
          }, 1500);
        </script>
      </body>
    </html>
  `);
});

// Set up multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Store active tasks
const tasks = new Map();

app.post('/api/upload', upload.single('file'), (req, res) => {
  console.log('[DEBUG] Received upload request');
  if (!req.file) {
    console.log('[DEBUG] No file in request');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    console.log(`[DEBUG] Parsing file: ${req.file.originalname} (${req.file.size} bytes)`);
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const taskId = Date.now().toString();
    tasks.set(taskId, {
      status: 'pending',
      data,
      progress: 0,
      total: data.length,
      results: [],
      clients: [] // SSE clients
    });

    res.json({ taskId, totalRows: data.length });
  } catch (error) {
    console.error('Error parsing Excel:', error);
    res.status(500).json({ error: 'Failed to parse Excel file' });
  }
});

// SSE Endpoint
app.get('/api/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add client to task
  task.clients.push(res);

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'INIT', progress: task.progress, total: task.total })}\n\n`);

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    task.clients = task.clients.filter((client: any) => client !== res);
  });
});

app.post('/api/start/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status === 'running') {
    return res.status(400).json({ error: 'Task already running' });
  }

  task.status = 'running';
  res.json({ message: 'Task started' });

  // Run automation in background
  runAutomation(taskId).catch(err => console.error('Automation error:', err));
});

function broadcast(task: any, event: any) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const disconnectedClients: any[] = [];
  
  task.clients.forEach((client: any) => {
    try {
      if (client.writable) {
        client.write(data);
      } else {
        disconnectedClients.push(client);
      }
    } catch (err) {
      console.error('[SSE] Failed to write to client:', err);
      disconnectedClients.push(client);
    }
  });

  if (disconnectedClients.length > 0) {
    task.clients = task.clients.filter((c: any) => !disconnectedClients.includes(c));
  }
}

function translatePlaywrightError(errorMsg: string, currentStep: string): string {
  if (errorMsg.includes('Timeout')) return `انتهى وقت الانتظار في خطوة (${currentStep}). الموقع بطيء أو العنصر غير موجود.`;
  if (errorMsg.includes('Target closed') || errorMsg.includes('browser has been closed')) return 'تم إغلاق المتصفح أو الصفحة بشكل غير متوقع.';
  if (errorMsg.includes('net::ERR_')) return 'مشكلة في الاتصال بالإنترنت أو الموقع لا يستجيب.';
  if (errorMsg.includes('locator.click') || errorMsg.includes('not visible')) return `فشل في النقر على عنصر في خطوة (${currentStep}). قد يكون الموقع قد تغير أو ظهرت نافذة منبثقة.`;
  if (errorMsg.includes('locator.fill')) return `فشل في إدخال البيانات في خطوة (${currentStep}).`;
  return `خطأ غير متوقع في خطوة (${currentStep}).`;
}

async function runAutomation(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    return;
  }

  broadcast(task, { type: 'LOG', message: '[SYSTEM] جاري بدء تهيئة المتصفح...' });

  try {
    broadcast(task, { type: 'LOG', message: '[SYSTEM] جاري استدعاء chromium.launch...' });
    
    // Launch browser with a promise timeout
    const launchPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled'
      ]
    }).catch(err => {
      console.error('[CRITICAL] Browser launch failed:', err);
      broadcast(task, { type: 'LOG', message: `❌ فشل تشغيل المتصفح: ${err.message}` });
      throw err;
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Browser launch timed out after 45s')), 45000)
    );

    const browser = await Promise.race([launchPromise, timeoutPromise]) as any;
    broadcast(task, { type: 'LOG', message: '[SYSTEM] تم تشغيل المتصفح بنجاح.' });

    for (let i = 0; i < task.data.length; i++) {
      const row = task.data[i];
      const nationalId = row['الرقم القومي'] || row['National ID'] || 'Unknown';
      
      broadcast(task, { type: 'LOG', message: `جاري معالجة العميل ${i + 1}: ${nationalId}...` });

      const context = await browser.newContext({
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

      try {
        // 1. Open Site
        currentStep = 'فتح صفحة الحجز';
        const targetUrl = 'https://srv.nbe.com.eg/Online_Booking';
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        broadcast(task, { type: 'LOG', message: `[INFO] تم فتح الرابط المباشر، جاري تحميل العناصر...` });
        await page.waitForTimeout(5000); // Wait for Angular/React to initialize

        // Determine if we need to work inside an iframe FIRST
        let targetFrame: any = page;
        const frameCount = await page.locator('iframe').count();
        if (frameCount > 0) {
            broadcast(task, { type: 'LOG', message: `[INFO] تم العثور على إطار (iframe)، سيتم توجيه الإدخال داخله...` });
            targetFrame = page.frameLocator('iframe').first();
        }

        // Handle Location Popup INSIDE the targetFrame (or page if no iframe)
        try {
            // Broaden the search for the close button
            const popupCloseBtn = targetFrame.locator('button:has-text("اغلاق"), button:has-text("إغلاق"), button:has-text("Close"), button:has-text("موافق"), button:has-text("OK"), .close, .btn-close').first();
            
            // Wait up to 8 seconds for the popup to appear
            if (await popupCloseBtn.isVisible({ timeout: 8000 })) {
                broadcast(task, { type: 'LOG', message: `[INFO] تم العثور على رسالة تحديد الموقع، جاري إغلاقها...` });
                await popupCloseBtn.evaluate((el: HTMLElement) => el.click()).catch((e: any) => console.log('Failed to click main close button:', e));
                await page.waitForTimeout(1000);
            } else {
                // Sometimes it's not a button but an 'a' tag or span
                const altCloseBtn = targetFrame.locator('a:has-text("اغلاق"), a:has-text("إغلاق"), span:has-text("اغلاق")').first();
                if (await altCloseBtn.isVisible({ timeout: 2000 })) {
                    broadcast(task, { type: 'LOG', message: `[INFO] تم العثور على رسالة تحديد الموقع (رابط)، جاري إغلاقها...` });
                    await altCloseBtn.evaluate((el: HTMLElement) => el.click()).catch((e: any) => console.log('Failed to click alt close button:', e));
                    await page.waitForTimeout(1000);
                }
            }
        } catch (e) {
            // Ignore if popup not found
            console.log("Popup not found or error closing it:", e);
        }

        // Pre-step: Check if we are on a details page that requires clicking "Book" first
        const startBookingBtn = targetFrame.locator('button:has-text("احجز"), button:has-text("حجز موعد"), a:has-text("احجز"), button:has-text("تقديم"), button:has-text("طلب")').first();
        try {
            if (await startBookingBtn.isVisible({ timeout: 3000 })) {
                broadcast(task, { type: 'LOG', message: `[INFO] تم العثور على زر بدء الحجز، جاري النقر...` });
                await startBookingBtn.click();
                await page.waitForTimeout(4000); // Wait for form to load
            }
        } catch (e) {
            // Ignore if button not found, assume form is already on screen
        }

        // Take initial screenshot to see what the bot sees
        let stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'شاشة البداية للموقع', isError: false });

        // Extract data from Excel row
        const phone = row['الهاتف'] || row['رقم الهاتف'] || '';
        const email = row['البريد'] || row['البريد الإلكتروني'] || '';
        const category = row['القسم'] || '';
        const service = row['الخدمة'] || '';
        const governorate = row['المحافظة'] || '';
        const region = row['المنطقة'] || '';
        const branch = row['الفرع'] || '';

        // Step 1: Personal Info
        currentStep = 'إدخال البيانات الشخصية';
        broadcast(task, { type: 'LOG', message: `الخطوة 1: إدخال البيانات الشخصية...` });
        
        // Wait for any input to appear on the page/frame to ensure form is loaded
        await targetFrame.locator('input').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => console.log('No inputs visible after 15s'));

        // DEBUG: Print available inputs to log
        try {
            const allInputs = await targetFrame.locator('input').evaluateAll((els: HTMLInputElement[]) => els.map(e => ({ id: e.id, placeholder: e.placeholder, name: e.name, type: e.type })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Inputs found: ${JSON.stringify(allInputs)}` });
            
            const allButtons = await targetFrame.locator('button').evaluateAll((els: HTMLButtonElement[]) => els.map(e => ({ text: e.innerText?.trim(), id: e.id })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Buttons found: ${JSON.stringify(allButtons)}` });
        } catch (e) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Failed to list inputs/buttons: ${e}` });
        }

        // Try to find inputs by their exact IDs as seen in the debug logs
        const nationalIdLocator = targetFrame.locator('#nationalid').first();
        const phoneLocator = targetFrame.locator('#mobilenumber').first();
        const emailLocator = targetFrame.locator('#Email_txt').first();

        // 1. Fill National ID
        if (await nationalIdLocator.isVisible({ timeout: 5000 })) {
            await nationalIdLocator.fill(String(nationalId));
        } else {
            // Fallback to placeholder
            const fallbackId = targetFrame.locator('input[placeholder*="الرقم القومي"], input[placeholder*="القومي"]').first();
            if (await fallbackId.isVisible()) await fallbackId.fill(String(nationalId));
        }

        // 2. Fill Phone
        if (await phoneLocator.isVisible({ timeout: 2000 })) {
            await phoneLocator.fill(String(phone));
        } else {
            // Fallback to placeholder
            const fallbackPhone = targetFrame.locator('input[placeholder*="الهاتف"], input[placeholder*="المحمول"]').first();
            if (await fallbackPhone.isVisible()) await fallbackPhone.fill(String(phone));
        }

        // 3. Fill Email (Optional)
        if (email) {
            if (await emailLocator.isVisible({ timeout: 2000 })) {
                await emailLocator.fill(String(email));
            } else {
                const fallbackEmail = targetFrame.locator('input[placeholder*="البريد"], input[type="email"]').first();
                if (await fallbackEmail.isVisible()) await fallbackEmail.fill(String(email));
            }
        }

        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'بعد إدخال البيانات الشخصية', isError: false });

        // Click Next/Execute ("تنفيذ")
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
                throw new Error(`رسالة خطأ من الموقع في خطوة إدخال البيانات: ${errText.trim()}`);
            }
        }

        // Verify transition to Step 2
        const categoryDropdowns = targetFrame.locator('select');
        const customCategoryDropdowns = targetFrame.locator('mat-select, .dropdown-toggle, [role="combobox"]');
        if ((await categoryDropdowns.count() < 2) && (await customCategoryDropdowns.count() < 2)) {
             throw new Error("لم يتم الانتقال إلى خطوة (القسم والخدمة). يرجى مراجعة البيانات المدخلة وتأكيد صحة الصفحة.");
        }
        // -------------------------

        // Step 2: Category & Service
        currentStep = 'اختيار القسم والخدمة';
        broadcast(task, { type: 'LOG', message: `الخطوة 2: اختيار القسم والخدمة...` });
        
        // Wait a moment for the new step to load
        await page.waitForTimeout(2000);

        // DEBUG: Print available selects and buttons
        try {
            const allSelects = await targetFrame.locator('select').evaluateAll((els: HTMLSelectElement[]) => els.map(e => ({ id: e.id, name: e.name, options: Array.from(e.options).map(o => o.text.trim()) })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Selects found: ${JSON.stringify(allSelects)}` });
            
            const allButtons = await targetFrame.locator('button, input[type="submit"]').evaluateAll((els: any[]) => els.map(e => ({ text: e.innerText?.trim() || e.value, id: e.id })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Buttons found: ${JSON.stringify(allButtons)}` });
        } catch (e) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Failed to list selects/buttons: ${e}` });
        }

        // We will try to click dropdowns or select elements
        const dropdowns = targetFrame.locator('select');
        if (await dropdowns.count() >= 2) {
            try {
                // 1. Select Category
                const catSelect = dropdowns.nth(0);
                const catOptions = await catSelect.locator('option').allInnerTexts();
                // Find best match (ignoring "ال" and spaces)
                const normalizedCategory = category.replace(/ال/g, '').trim();
                const matchedCat = catOptions.find(opt => opt.replace(/ال/g, '').includes(normalizedCategory) || normalizedCategory.includes(opt.replace(/ال/g, '').trim()));
                
                if (matchedCat) {
                    await catSelect.selectOption({ label: matchedCat });
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار القسم: ${matchedCat}` });
                } else {
                    broadcast(task, { type: 'LOG', message: `[WARNING] لم يتم العثور على القسم المطابق لـ: ${category}` });
                }
                
                await page.waitForTimeout(2000); // Wait for services to load based on category
                
                // 2. Select Service
                const srvSelect = dropdowns.nth(1);
                const srvOptions = await srvSelect.locator('option').allInnerTexts();
                const normalizedService = service.replace(/ال/g, '').trim();
                const matchedSrv = srvOptions.find(opt => opt.replace(/ال/g, '').includes(normalizedService) || normalizedService.includes(opt.replace(/ال/g, '').trim()));
                
                if (matchedSrv) {
                    await srvSelect.selectOption({ label: matchedSrv });
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار الخدمة: ${matchedSrv}` });
                } else {
                    broadcast(task, { type: 'LOG', message: `[WARNING] لم يتم العثور على الخدمة المطابقة لـ: ${service}` });
                }
            } catch (err) {
                broadcast(task, { type: 'LOG', message: `[DEBUG] Error interacting with dropdowns: ${err}` });
            }
        } else {
            // Fallback for non-select dropdowns (if they change it later)
            const customDropdowns = targetFrame.locator('mat-select, .dropdown-toggle, [role="combobox"]');
            if (await customDropdowns.count() >= 2) {
                await customDropdowns.nth(0).click({ timeout: 5000 });
                await page.waitForTimeout(1000);
                await targetFrame.locator(`text=${category}`).first().click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
                
                await page.waitForTimeout(1000);
                
                await customDropdowns.nth(1).click({ timeout: 5000 });
                await page.waitForTimeout(1000);
                await targetFrame.locator(`text=${service}`).first().click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
            }
        }

        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'بعد اختيار الخدمة', isError: false });

        const nextBtn2 = targetFrame.locator('#Submit_btn, input[type="submit"], button:has-text("تنفيذ"), button:has-text("التالي"), button:has-text("Next"), button:has-text("استمرار")').first();
        if (await nextBtn2.isVisible({ timeout: 5000 })) {
            await nextBtn2.click({ timeout: 5000 });
            await page.waitForTimeout(3000);
        } else {
             throw new Error(`تعذر العثور على زر التأكيد في خطوة (القسم والخدمة).`);
        }

        // --- Step 2 Validation ---
        // Verify transition to Step 3 (Branch Selection requires Governorate/Cities DDL or radio buttons)
        const govDDL = targetFrame.locator('#GovernorateDDL, select').first();
        const branchRadios = targetFrame.locator('input[type="radio"]');
        if (!(await govDDL.isVisible({ timeout: 3000 }).catch(()=>false)) && (await branchRadios.count()) === 0) {
             throw new Error(`فشل الانتقال إلى خطوة (اختيار الفرع). القسم أو الخدمة غير متاحة حالياً أو يوجد خطأ بالموقع.`);
        }
        // -------------------------

        // Step 3: Branch Selection
        currentStep = 'اختيار الفرع';
        broadcast(task, { type: 'LOG', message: `الخطوة 3: اختيار الفرع (القاهرة -> مدينة نصر -> عباس العقاد)...` });
        
        await page.waitForTimeout(3000); 
        
        // Hide chatbot
        await page.addStyleTag({ content: '.chatbot-container, [id^="chatbot"], [class^="chatbot"], .messenger-launcher, #watson-chat-container { display: none !important; }' }).catch(() => {});

        let branchClicked = false;
        try {
            // 1. Precise Governorate & Region Selection (Targets: #GovernorateDDL, #CitiesDDL)
            const govSelect = targetFrame.locator('#GovernorateDDL, select').first();
            const regSelect = targetFrame.locator('#CitiesDDL, select').nth(1);
            
            // Select Cairo (القاهرة)
            const targetGov = governorate || 'القاهرة';
            await govSelect.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
            
            const govOptions = await govSelect.locator('option').evaluateAll((opts: HTMLOptionElement[]) => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' })));
            const matchedGov = govOptions.find(o => o.text.includes(targetGov) || targetGov.includes(o.text));
            
            if (matchedGov) {
                await govSelect.selectOption(matchedGov.value);
                await govSelect.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
                broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار المحافظة: ${matchedGov.text}` });
            }

            // Waiting for Region (مدينة نصر) - Essential for Select2/Dynamic load
            broadcast(task, { type: 'LOG', message: `[PROCESS] جاري انتظار تفعيل قائمة المنطقة...` });
            
            let isRegReady = false;
            for(let i=0; i<30; i++) { // Up to 30s as per video behavior
                const isDisabled = await regSelect.evaluate((el: HTMLSelectElement) => el.disabled);
                const optionsCount = await regSelect.locator('option').count();
                if (!isDisabled && optionsCount > 1) {
                    isRegReady = true;
                    break;
                }
                await page.waitForTimeout(1000);
            }

            if (isRegReady) {
                const targetReg = region || 'مدينة نصر';
                const regOptions = await regSelect.locator('option').evaluateAll((opts: HTMLOptionElement[]) => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' })));
                const matchedReg = regOptions.find(o => o.text.includes(targetReg) || targetReg.includes(o.text));
                if (matchedReg) {
                    await regSelect.selectOption(matchedReg.value);
                    await regSelect.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار المنطقة: ${matchedReg.text}` });
                    await page.waitForTimeout(3000); // Wait for branches to appear
                }
            }

            // 2. Branch Search Input (Optional but helpful for filtering)
            const searchInput = targetFrame.locator('input[type="text"]:not([readonly]), input[placeholder*="الفرع"]').last();
            const branchSearchTerm = branch.replace('فرع ', '').replace('الرئيسي', '').trim() || 'عباس العقاد';

            if (await searchInput.isVisible({ timeout: 5000 })) {
                await searchInput.fill(branchSearchTerm);
                await searchInput.press('Enter');
                broadcast(task, { type: 'LOG', message: `[PROCESS] تم البحث عن الفرع...` });
                await page.waitForTimeout(3000); 
            }

            // 3. Selection of Radio Button
            broadcast(task, { type: 'LOG', message: `[PROCESS] جاري انتظار ورصد الفروع في الصفحة...` });
            
            const radiosLocator = targetFrame.locator('input[type="radio"]');
            
            // Wait for at least one radio button to attach
            let radiosAvailable = false;
            try {
                await radiosLocator.first().waitFor({ state: 'attached', timeout: 8000 });
                radiosAvailable = true;
            } catch (e) {
                broadcast(task, { type: 'LOG', message: `⚠️ وقت انتظار الفروع انتهى.` });
            }

            if (radiosAvailable) {
                const count = await radiosLocator.count();
                broadcast(task, { type: 'LOG', message: `[PROCESS] تم رصد ${count} خيارات بالبرمجة.` });
                
                const normalize = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, '').trim();
                const targetNorm = normalize(branchSearchTerm);
                
                // Tier 1: Try specific match
                for (let i = 0; i < count; i++) {
                    const radio = radiosLocator.nth(i);
                    const parentText = await radio.locator('xpath=..').innerText().catch(() => '') || '';
                    const grandParentText = await radio.locator('xpath=../..').innerText().catch(() => '') || '';
                    const combinedText = parentText + ' ' + grandParentText;
                    
                    if (normalize(combinedText).includes(targetNorm) || (branch.includes('073') && combinedText.includes('073'))) {
                        await radio.click({ force: true }).catch(() => {});
                        await radio.evaluate((el: HTMLInputElement) => {
                            el.checked = true;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('click', { bubbles: true }));
                        }).catch(() => {});
                        
                        branchClicked = true;
                        broadcast(task, { type: 'LOG', message: `✅ تم العثور على الفرع المطلوب واختياره.` });
                        break;
                    }
                }

                // Tier 2: Fallback to first available using locators
                if (!branchClicked) {
                    broadcast(task, { type: 'LOG', message: `⚠️ لم يُطابق الاسم أي فرع، جاري إجبار اختيار أول فرع...` });
                    const firstRadio = radiosLocator.first();
                    await firstRadio.click({ force: true }).catch(() => {});
                    await firstRadio.evaluate((el: HTMLInputElement) => {
                        el.checked = true;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('click', { bubbles: true }));
                    }).catch(() => {});
                    
                    branchClicked = true;
                    broadcast(task, { type: 'LOG', message: `✅ تم إجبار اختيار الفرع الأول.` });
                }
            } else {
                // Tier 3: Extreme fallback JS evaluation without offsetParent restriction
                broadcast(task, { type: 'LOG', message: `⚠️ محاولة أخيرة عبر حقن سكربت (JS) للبحث عن الدوائر...` });
                const frames = page.frames();
                for (const f of frames) {
                    try {
                        const anyRadioFound = await f.evaluate(() => {
                            const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
                            if (allRadios.length > 0) {
                                allRadios[0].checked = true;
                                allRadios[0].click();
                                allRadios[0].dispatchEvent(new Event('change', { bubbles: true }));
                                return true;
                            }
                            return false;
                        }).catch(() => false);

                        if (anyRadioFound) {
                            branchClicked = true;
                            broadcast(task, { type: 'LOG', message: `✅ نجحت المحاولة الأخيرة بالتحديد عبر السكربت.` });
                            break;
                        }
                    } catch (e) {}
                }
            }

            if (!branchClicked) {
                broadcast(task, { type: 'LOG', message: `⚠️ لم يتم العثور على أي فروع متاحة للاختيار. سيتم المحاولة بالضغط على "تنفيذ" للتحقق.` });
            }

            await page.waitForTimeout(1500);
        } catch (err) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Error in Step 3 selection: ${err}` });
        }
        
        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'الحالة قبل الضغط على تنفيذ', isError: false });

        const nextBtn3 = targetFrame.locator('button:has-text("تنفيذ"), #Submit_btn, input[type="submit"]').first();
        if (await nextBtn3.isVisible({ timeout: 5000 })) {
            broadcast(task, { type: 'LOG', message: `[PROCESS] الضغط على زر "تنفيذ"...` });
            await nextBtn3.click({ force: true });
            
            // Step 3 Validation: "Required" appears AFTER clicking if selection failed, OR we don't transition to Time selection
            await page.waitForTimeout(3000);
            const isRequiredVisible = await targetFrame.locator('text=مطلوب').isVisible({ timeout: 2000 }).catch(() => false);
            
            if (isRequiredVisible) {
                const errorShot = await page.screenshot({ type: 'jpeg', quality: 80 });
                broadcast(task, { type: 'SCREENSHOT', image: errorShot.toString('base64'), caption: 'خطأ: لم يتم اختيار الفرع', isError: true });
                throw new Error(`فشل تجاوز الفرع: رسالة "مطلوب" ظهرت. يبدو أن الفرع مغلق أو لا يوجد مواعيد.`);
            }

            // Check if we reached step 4 (Date/Time selects appeared)
            const isStep4Reached = await targetFrame.locator('select').count() >= 1 || await targetFrame.locator('input[type="radio"]').count() >= 1 || await targetFrame.locator('.date-picker, input[type="date"]').isVisible({timeout:2000}).catch(()=>false);
            if (!isStep4Reached) {
                throw new Error(`فشل الانتقال إلى المواعيد بعد تأكيد الفرع. قد تكون الفروع ممتلئة تماماً لهذا اليوم.`);
            }

            broadcast(task, { type: 'LOG', message: `[SUCCESS] تم تجاوز مرحلة اختيار الفرع بنجاح.` });
        } else {
            throw new Error(`توقف العملية: لم يتم العثور على زر "تنفيذ" بعد تحديد الفرع.`);
        }

        // Step 4: Date & Time
        currentStep = 'اختيار الموعد والتوقيت';
        broadcast(task, { type: 'LOG', message: `الخطوة 4: اختيار الموعد والتوقيت...` });
        
        try {
            // First: attempt to locate a dropdown (Legacy/Current structure)
            const selects = targetFrame.locator('select');
            const count = await selects.count().catch(() => 0);
            
            // Second: attempt to locate radio-buttons for dates/times (New structure shown in video)
            const dateRadios = targetFrame.locator('input[type="radio"], .radio-button');
            const radioCount = await dateRadios.count().catch(() => 0);

            if (count > 0) {
                 await selects.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
                 let daySelect = null;
                 let timeSelect = null;
                 
                 for(let i=0; i<count; i++) {
                     const label = await selects.nth(i).evaluate(el => {
                        const lbl = document.querySelector(`label[for="${el.id}"]`);
                        return lbl ? lbl.textContent?.trim() : '';
                     }).catch(() => '');
                     const options = await selects.nth(i).locator('option').allInnerTexts();
                     const optionsStr = options.join(' ');
     
                     if (label?.includes('يوم') || optionsStr.includes('202') || (optionsStr.includes('-') && optionsStr.length > 5)) {
                         if (!daySelect) daySelect = selects.nth(i);
                     } else if (label?.includes('توقيت') || optionsStr.includes(':') || optionsStr.includes('صباح') || optionsStr.includes('مساء')) {
                         if (!timeSelect) timeSelect = selects.nth(i);
                     }
                 }
                 
                 if (!daySelect && count >= 1) daySelect = selects.nth(0);
                 if (!timeSelect && count >= 2) timeSelect = selects.nth(1);
     
                 if (daySelect) {
                     const opts = await daySelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await daySelect.selectOption(opts[0]);
                         broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار اليوم بنجاح.` });
                         await page.waitForTimeout(3000); // Allow time to fetch times
                     }
                 }
                 
                 if (timeSelect) {
                     const opts = await timeSelect.locator('option').evaluateAll((os: HTMLOptionElement[]) => os.filter(o => o.value && !['', '0'].includes(o.value) && !o.textContent?.includes('اختر')).map(o => o.value));
                     if (opts.length > 0) {
                         await timeSelect.selectOption(opts[0]);
                         broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار التوقيت بنجاح.` });
                         await page.waitForTimeout(2000);
                     }
                 }
            } else if (radioCount > 0) {
                // Video pattern: List of dates as radio buttons, click first available
                broadcast(task, { type: 'LOG', message: `[PROCESS] تم العثور على تواريخ بنظام الأزرار (Radios)، اختيار الأول...` });
                await dateRadios.first().click({ force: true });
                await page.waitForTimeout(2000); // Sometimes picking a date reveals time buttons
                
                // See if times appeared below it as radios again
                const timeRadios = targetFrame.locator('input[type="radio"], .radio-button'); // Refetch
                if (await timeRadios.count() > 1 && await timeRadios.nth(1).isVisible()) {
                      await timeRadios.nth(1).click({ force: true }).catch(() => {});
                      broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار التوقيت من أزرار الأوقات.` });
                      await page.waitForTimeout(2000);
                }
            } else {
                 broadcast(task, { type: 'LOG', message: `⚠️ لم يتم رصد أي قوائم أو أزرار تواريخ.` });
            }
        } catch (e) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Error Step 4: ${e}` });
        }

        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'بعد اختيار الموعد', isError: false });

        const confirmBtn = targetFrame.locator('button:has-text("تنفيذ"), #Submit_btn, input[type="submit"]').first();
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click({ force: true });
        } else {
             throw new Error(`تعذر العثور على زر تأكيد الحجز النهائي بعد اختيار الموعد.`);
        }
        
        // --- Step 4 Validation ---
        await page.waitForTimeout(4000); 
        // Re-acquire frame in case it reloaded after submission
        targetFrame = page.frames().find(f => f.name() === 'myIFrm') || page.mainFrame();

        const successIndicators = targetFrame.locator('button:has-text("Download"), button:has-text("تحميل"), a:has-text("تحميل"), .download, :has-text("تعديل الحجز"), :has-text("الغاء الحجز"), .ticket, .modal-content, .alert-success').first();
        const isSuccess = await successIndicators.isVisible({ timeout: 5000 }).catch(() => false) || await targetFrame.locator('text=Download').count() > 0 || await targetFrame.locator('text=تحميل').count() > 0;

        if (!isSuccess) {
            // Check if there's a soft error displayed on screen
            const dateError = await targetFrame.locator('text=غير متاح, text=عفوا, .alert').isVisible({timeout: 2000}).catch(()=>false);
            if (dateError) {
                throw new Error(`فشل تأكيد الحجز: الموقع رفض الموعد أو اليوم غير متاح الآن.`);
            } else {
                throw new Error(`فشل تأكيد الموعد النهائي: الصفحة لم تظهر التذكرة بعد الضغط على تنفيذ.`);
            }
        }
        // -------------------------

        // Step 5: Confirmation Ticket
        currentStep = 'تأكيد الحجز واستخراج التذكرة';
        broadcast(task, { type: 'LOG', message: `الخطوة 5: جاري تأكيد الحجز واستخراج التذكرة...` });
        
        // Wait explicitly for the final elements to appear
        await page.waitForTimeout(4000); 

        // Re-acquire frame in case it reloaded after submission
        targetFrame = page.frames().find(f => f.name() === 'myIFrm') || page.mainFrame();

        // Take a full-page screenshot of the final state right away for debug logs (NOT flagged as ticket)
        const successScreenshot = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true });
        broadcast(task, { 
          type: 'SCREENSHOT', 
          image: successScreenshot.toString('base64'), 
          caption: `النتيجة النهائية (لقطة الشاشة كاملة) - ${nationalId}`,
          isError: false
        });

        // If we reached here, Step 4 validation passed, so it IS a success.
        status = 'ناجح';
        note = 'تم الحجز بنجاح وتم التقاط التذكرة';
        
        try {
            // 1. Take a clean, targeted screenshot of the ticket modal itself
            broadcast(task, { type: 'LOG', message: `[PROCESS] محاولة العثور على التذكرة لقصها (بالبحث التسلقي)...` });
                
                const findTicketLogic = () => {
                    // Look for common text nodes strictly inside the ticket
                    const allElems = Array.from(document.querySelectorAll('*'));
                    let seedNode = null;
                    for (const el of allElems) {
                        if (el.children.length === 0 && el.textContent) {
                            if (el.textContent.includes('15') || el.textContent.includes('دقيقة') || el.textContent.includes('الفرع') || el.textContent.includes('التواجد') || el.textContent.includes('QR')) {
                                seedNode = el;
                                break;
                            }
                        }
                    }
                    
                    // Climb the DOM tree from the text node until we find a reasonably sized graphical box
                    let container = seedNode;
                    while (container && container !== document.body && container !== document.documentElement) {
                        const rect = container.getBoundingClientRect();
                        const style = window.getComputedStyle(container);
                        const isModal = typeof container.className === 'string' && (container.className.includes('modal-content') || container.className.includes('modal-dialog') || container.className.includes('ticket'));
                        
                        // Ticket sizes usually range from 200px to 800px width/height and have a non-transparent background
                        if (rect.height >= 200 && rect.width >= 250 && rect.width <= 1000) {
                            if (isModal || container.id === 'printDIV' || container.id === 'ticket' || (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')) {
                                container.id = 'nbe-auto-ticket-target';
                                return '#nbe-auto-ticket-target';
                            }
                        }
                        container = container.parentElement;
                    }

                    // Static fallbacks
                    const m1 = document.querySelector('.modal-content, .modal-dialog');
                    if (m1) { m1.id = 'nbe-auto-ticket-target'; return '#nbe-auto-ticket-target'; }

                    const m2 = document.querySelector('#printDIV');
                    if (m2) { m2.id = 'nbe-auto-ticket-target'; return '#nbe-auto-ticket-target'; }

                    return null;
                };

                let ticketShotBase64 = null;

                try {
                    // Try to find the ticket box inside the iframe first
                    let foundSelector = await targetFrame.evaluate(findTicketLogic).catch(() => null);
                    let finalLocator = foundSelector ? targetFrame.locator(foundSelector) : null;
                    
                    // If not found in iframe, try finding it in the main page (sometimes popups jump out of iframes)
                    if (!finalLocator) {
                        foundSelector = await page.evaluate(findTicketLogic).catch(() => null);
                        finalLocator = foundSelector ? page.locator(foundSelector) : null;
                    }

                    if (finalLocator) {
                        try {
                            // Fetch dimensions bypassing scroll algorithms. boundingBox() automatically handles iframe offsets!
                            const box = await finalLocator.boundingBox({ timeout: 5000 });
                            
                            if (box && box.width > 0 && box.height > 0) {
                                // Clamp the viewport to ensure the area is fully visible, but without triggering explicit scroll actions on the element
                                ticketShotBase64 = (await page.screenshot({ 
                                    type: 'jpeg', 
                                    quality: 60,
                                    clip: { x: box.x, y: box.y, width: box.width, height: box.height},
                                    timeout: 10000
                                })).toString('base64');
                            } else {
                                throw new Error("Bounding box null or zero");
                            }
                        } catch (e: any) {
                             broadcast(task, { type: 'LOG', message: `[DEBUG] فشل القص الدقيق (${e.message})، سيتم محاولة حفظ المشهد المعروض.` });
                             // If completely detached, try blindly capturing without checks, failing fast if needed
                             ticketShotBase64 = (await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
                        }
                    }
                } catch (shotErr: any) {
                    broadcast(task, { type: 'LOG', message: `[DEBUG] حدث خطأ أثناء قص الصورة: ${shotErr.message}` });
                }

                if (ticketShotBase64) {
                    broadcast(task, { 
                        type: 'SCREENSHOT', 
                        image: ticketShotBase64, 
                        caption: `تذكرة العميل: ${nationalId}`,
                        isError: false,
                        isTicket: true // <--- sends only the clean cropped ticket to the gallery
                    });
                } else {
                    broadcast(task, { type: 'LOG', message: `⚠️ لم يتم العثور على الإطار الأبيض للتذكرة لقصها!` });
                }

                // 2. Click Download button if present
                const downloadBtn = targetFrame.locator('button:has-text("Download"), a:has-text("Download"), .download, button:has-text("تحميل"), a:has-text("تحميل")').first();
                if (await downloadBtn.isVisible({ timeout: 3000 })) {
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم العثور على زر التنزيل، جاري الضغط عليه...` });
                    await downloadBtn.click({ force: true }).catch(() => {});
                    broadcast(task, { type: 'LOG', message: `✅ تم الضغط على زر التنزيل بنجاح.` });
                    await page.waitForTimeout(3000); // Give it time to trigger
                }
            } catch (ticketErr) {
                broadcast(task, { type: 'LOG', message: `[DEBUG] اكتمل الحجز ولكن واجهنا التأخير في تصوير التذكرة: ${ticketErr}` });
            }
      } catch (error: any) {
        const rawError = error.message || 'Error occurred';
        const friendlyError = translatePlaywrightError(rawError, currentStep);
        
        status = 'فشل';
        note = friendlyError;
        
        broadcast(task, { type: 'LOG', message: `[ERROR] فشل الحجز: ${friendlyError}` });
        broadcast(task, { type: 'LOG', message: `[SYSTEM] تفاصيل الخطأ التقني: ${rawError.split('\n')[0]}` });
        
        try {
          // Take a detailed full-page screenshot on error
          const errorScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
          const currentUrl = page.url();
          
          broadcast(task, { 
            type: 'SCREENSHOT', 
            image: errorScreenshot.toString('base64'), 
            caption: `❌ خطأ في خطوة (${currentStep}) - الرابط: ${currentUrl.substring(0, 50)}...`,
            isError: true
          });
        } catch (e) {
          console.error('Failed to take error screenshot', e);
        }
      } finally {
        await context.close();
      }

      task.progress = i + 1;
      const resultRow = { ...row, 'حالة الحجز': status, 'ملاحظات': note };
      task.results.push(resultRow);
      
      broadcast(task, { 
        type: 'PROGRESS', 
        progress: task.progress, 
        total: task.total,
        result: resultRow
      });
    }

    await browser.close();
    task.status = 'completed';
    broadcast(task, { type: 'COMPLETE', results: task.results });

  } catch (error: any) {
    console.error('Browser launch error:', error);
    broadcast(task, { type: 'LOG', message: `Browser Error: ${error.message}` });
    task.status = 'failed';
  }
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

startServer();
