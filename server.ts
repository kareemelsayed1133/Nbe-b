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

// Set up multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Store active tasks
const tasks = new Map();

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
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

  req.on('close', () => {
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
  task.clients.forEach((client: any) => client.write(data));
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
  if (!task) return;

  try {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    for (let i = 0; i < task.data.length; i++) {
      const row = task.data[i];
      const nationalId = row['الرقم القومي'] || row['National ID'] || 'Unknown';
      
      broadcast(task, { type: 'LOG', message: `جاري معالجة العميل ${i + 1}: ${nationalId}...` });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
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
                throw new Error(`رسالة خطأ من الموقع: ${errText.trim()}`);
            }
        }

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
        }

        // Step 3: Branch Selection
        currentStep = 'اختيار الفرع';
        broadcast(task, { type: 'LOG', message: `الخطوة 3: اختيار الفرع...` });
        
        await page.waitForTimeout(2000); // Wait for the new page to load
        
        try {
            // DEBUG: Print available selects and inputs for Step 3
            const step3Selects = await targetFrame.locator('select').evaluateAll((els: HTMLSelectElement[]) => els.map(e => ({ id: e.id, name: e.name, options: Array.from(e.options).map(o => o.text.trim()) })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Step 3 Selects: ${JSON.stringify(step3Selects)}` });
            
            const step3Radios = await targetFrame.locator('input[type="radio"]').evaluateAll((els: HTMLInputElement[]) => els.map(e => ({ id: e.id, value: e.value, name: e.name })));
            broadcast(task, { type: 'LOG', message: `[DEBUG] Step 3 Radios: ${JSON.stringify(step3Radios)}` });
            
            const branchDropdowns = targetFrame.locator('select');
            if (await branchDropdowns.count() > 0) {
                // 1. Select "Search all branches" in the Governorate dropdown
                const govSelect = branchDropdowns.nth(0);
                const govOptionsHandle = await govSelect.elementHandle();
                const govOptions = govOptionsHandle ? await govOptionsHandle.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))) : [];
                
                const searchAllOption = govOptions.find(o => o.text.includes('بحث في كافة') || o.text.includes('بحث'));
                if (searchAllOption && searchAllOption.value) {
                    await govSelect.selectOption(searchAllOption.value);
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم تعيين المحافظة إلى: ${searchAllOption.text}` });
                    await page.waitForTimeout(2000); // Wait for UI to update
                }
            }

            // 2. Type Branch name directly into the search input
            // The search box usually has a specific placeholder or is the last text input before radios
            const searchInputLocator = targetFrame.locator('input[type="text"]:not([readonly])').last();
            
            const cleanSearchQuery = branch.replace('فرع ', '').replace('الرئيسي', '').trim();
            const normalizedBranchToFind = cleanSearchQuery; // No aggressive stripping here

            if (await searchInputLocator.count() > 0 && await searchInputLocator.isVisible()) {
                await searchInputLocator.fill(cleanSearchQuery);
                await searchInputLocator.press('Enter'); // Trigger any listeners bound to Enter
                broadcast(task, { type: 'LOG', message: `[PROCESS] تم كتابة اسم الفرع للبحث: ${cleanSearchQuery}` });
                await page.waitForTimeout(3000); // Wait for the list to filter
            } else {
                 broadcast(task, { type: 'LOG', message: `[DEBUG] لم يتم العثور على حقل بحث نشط للفرع، سيتم البحث في القائمة الحالية.` });
            }

            // 3. Select Branch (Radio buttons)
            const branchLabels = targetFrame.locator('label');
            const labelTexts = await branchLabels.allInnerTexts();
            
            let branchClicked = false;
            // Iterate and find matching label
            for (let i = 0; i < await branchLabels.count(); i++) {
                const text = labelTexts[i];
                if (!text) continue;
                
                // Flexible Match: Check if the text matches the raw user string, or the normalized query
                const textClean = text.trim();
                const matches = textClean.includes(branch.trim()) || 
                                textClean.includes(cleanSearchQuery) || 
                                cleanSearchQuery.includes(textClean);
                                
                if (matches) {
                    await branchLabels.nth(i).click();
                    branchClicked = true;
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار الفرع المطابق: ${textClean}` });
                    break;
                }
            }
            
            if (!branchClicked) {
                // Fallback: click the first radio button if it exists
                const firstRadio = targetFrame.locator('input[type="radio"]').first();
                if (await firstRadio.isVisible()) {
                    await firstRadio.click({ force: true });
                    branchClicked = true;
                    broadcast(task, { type: 'LOG', message: `[WARNING] تم اختيار أول فرع متاح في نتائج البحث كبديل.` });
                }
            }
            
            if (!branchClicked) {
                 broadcast(task, { type: 'LOG', message: `[WARNING] لم يظهر أي فرع متاح لتحديده.` });
            }
            
        } catch (err) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Error in Step 3: ${err}` });
        }

        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'بعد اختيار الفرع', isError: false });

        const nextBtn3 = targetFrame.locator('#Submit_btn, input[type="submit"], button:has-text("تنفيذ"), button:has-text("التالي"), button:has-text("Next"), button:has-text("استمرار")').first();
        if (await nextBtn3.isVisible({ timeout: 5000 })) {
            await nextBtn3.click({ timeout: 5000 });
            await page.waitForTimeout(3000);
        }

        // Step 4: Date & Time
        currentStep = 'اختيار الموعد والتوقيت';
        broadcast(task, { type: 'LOG', message: `الخطوة 4: اختيار الموعد والتوقيت...` });
        
        await page.waitForTimeout(2000); // Wait for page to load
        
        try {
            // Based on screenshots, Date and Time are standard <select> elements
            const dateTimeDropdowns = targetFrame.locator('select');
            
            if (await dateTimeDropdowns.count() >= 2) {
                // 1. Select Date
                const dateSelect = dateTimeDropdowns.nth(0);
                const dateOptionsHandle = await dateSelect.elementHandle();
                const dateOptions = dateOptionsHandle ? await dateOptionsHandle.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))) : [];
                
                // Select first valid date
                const validDate = dateOptions.find(o => o.value && o.text.trim() !== '' && !o.text.includes('اختر'));
                if (validDate) {
                    await dateSelect.selectOption(validDate.value);
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار اليوم: ${validDate.text}` });
                    await page.waitForTimeout(3000); // Wait for times to load based on selected date
                } else {
                    broadcast(task, { type: 'LOG', message: `[WARNING] لم يتم العثور على أيام متاحة للحجز.` });
                }

                // 2. Select Time
                const timeSelect = dateTimeDropdowns.nth(1);
                const timeOptionsHandle = await timeSelect.elementHandle();
                const timeOptions = timeOptionsHandle ? await timeOptionsHandle.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))) : [];
                
                // Select first valid time
                const validTime = timeOptions.find(o => o.value && o.text.trim() !== '' && !o.text.includes('اختر'));
                if (validTime) {
                    await timeSelect.selectOption(validTime.value);
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم اختيار التوقيت: ${validTime.text}` });
                    await page.waitForTimeout(2000); // Brief wait after selection
                } else {
                    broadcast(task, { type: 'LOG', message: `[WARNING] لم يتم العثور على توقيت متاح.` });
                }
            } else {
                 broadcast(task, { type: 'LOG', message: `[DEBUG] Select dropdowns not found in Step 4. Fallback logic skipped.` });
            }
        } catch (err) {
            broadcast(task, { type: 'LOG', message: `[DEBUG] Error in Step 4: ${err}` });
        }

        stepScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        broadcast(task, { type: 'SCREENSHOT', image: stepScreenshot.toString('base64'), caption: 'بعد اختيار الموعد', isError: false });

        const nextBtn4 = targetFrame.locator('#Submit_btn, input[type="submit"], button:has-text("تنفيذ"), button:has-text("التالي"), button:has-text("Next"), button:has-text("استمرار"), button:has-text("تأكيد")').first();
        if (await nextBtn4.isVisible({ timeout: 5000 })) {
            await nextBtn4.click({ timeout: 5000 });
        }
        
        // Step 5: Confirmation Ticket
        currentStep = 'تأكيد الحجز واستخراج التذكرة';
        broadcast(task, { type: 'LOG', message: `الخطوة 5: جاري تأكيد الحجز واستخراج التذكرة...` });
        await page.waitForTimeout(4000); // Wait for confirmation page
        
        // Take a full-page screenshot of the final state right away
        const successScreenshot = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true });
        broadcast(task, { 
          type: 'SCREENSHOT', 
          image: successScreenshot.toString('base64'), 
          caption: `النتيجة النهائية - ${nationalId}`,
          isError: false
        });

        // Verify success by checking for key elements on the final screen (e.g., Download, Cancel, Edit)
        const successIndicators = targetFrame.locator('button:has-text("Download"), a:has-text("Download"), :has-text("تعديل الحجز"), :has-text("الغاء الحجز")');
        const isSuccess = await successIndicators.count() > 0;

        if (isSuccess) {
            status = 'ناجح';
            note = 'تم الحجز بنجاح وتم التقاط التذكرة';
            
            try {
                // Find and click the download button
                const downloadBtn = targetFrame.locator('button:has-text("Download"), :text-is("Download"), .download').first();
                if (await downloadBtn.isVisible({ timeout: 3000 })) {
                    broadcast(task, { type: 'LOG', message: `[PROCESS] تم العثور على زر Download، جاري التحميل...` });
                    
                    // Race between download event and a timeout (some JS downloads don't trigger the standard browser download event)
                    const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
                    await downloadBtn.click({ force: true });
                    const downloadMessage = await downloadPromise;
                    
                    if (downloadMessage) {
                        const downloadPath = await downloadMessage.path();
                        const fs = require('fs');
                        const fileBuffer = fs.readFileSync(downloadPath);
                        const base64Data = fileBuffer.toString('base64');
                        
                        broadcast(task, { 
                            type: 'SCREENSHOT', 
                            image: base64Data, 
                            caption: `📥 ملف التذكرة (الرقم القومي: ${nationalId})`,
                            isError: false
                        });
                        broadcast(task, { type: 'LOG', message: `[SUCCESS] تم حفظ ملف التذكرة بنجاح.` });
                    } else {
                        // Fallback: take a targeted screenshot of the ticket area if Download event didn't fire
                        broadcast(task, { type: 'LOG', message: `[DEBUG] التنزيل المباشر كملف لم يعمل، جاري التقاط التذكرة كصورة مقصوصة...` });
                        const ticketLocator = targetFrame.locator('.modal-content, .modal-dialog, div').filter({ hasText: 'Download' }).filter({ hasText: 'البنك' }).last();
                        
                        if (await ticketLocator.isVisible()) {
                            const ticketShot = await ticketLocator.screenshot({ type: 'jpeg', quality: 90 });
                            broadcast(task, { 
                                type: 'SCREENSHOT', 
                                image: ticketShot.toString('base64'), 
                                caption: `📸 لقطة مقصوصة للتذكرة (الرقم القومي: ${nationalId})`,
                                isError: false
                            });
                        }
                    }
                }
            } catch (downloadErr) {
                broadcast(task, { type: 'LOG', message: `[DEBUG] تعذر حفظ التذكرة بشكل منفصل: ${downloadErr}` });
            }
        } else {
            status = 'مجهول (تحقق من الصورة)';
            note = 'لم يتم تأكيد النجاح صراحةً، يرجى مراجعة الصورة النهائية';
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

startServer();
