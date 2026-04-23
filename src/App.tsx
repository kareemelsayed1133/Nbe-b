import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Settings, Monitor, Shield, Clock, FileText, Menu, X, Info, CheckCircle, AlertTriangle, XCircle, Loader2, CreditCard, Users, Activity, RotateCcw, Ticket, FileType } from 'lucide-react';
import * as xlsx from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { governorates, ageGroups, generateMockClientData, categoriesMap, regionsMap } from './lib/egyptianIdGenerator';
import { jsPDF } from 'jspdf';

export default function App() {
  const [activeTab, setActiveTab] = useState<'booking' | 'generator' | 'tickets'>('booking');
  const [file, setFile] = useState<File | null>(null);
  const [mockData, setMockData] = useState<any[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ready' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<{ image: string, caption: string, isError: boolean }[]>([]);
  const [tickets, setTickets] = useState<{ image: string, caption: string }[]>([]);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number>(0);
  const [results, setResults] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedScreenshotForModal, setSelectedScreenshotForModal] = useState<any>(null);
  
  // Generator State
  const [genGov, setGenGov] = useState<string>('القاهرة');
  const [genGender, setGenGender] = useState<string>('عشوائي');
  const [genAge, setGenAge] = useState<string>('عشوائي');
  const [genCategory, setGenCategory] = useState<string>('عشوائي');
  const [genService, setGenService] = useState<string>('عشوائي');
  const [genRegion, setGenRegion] = useState<string>('مدينة نصر');
  const [genBranch, setGenBranch] = useState<string>('');
  const [genCount, setGenCount] = useState<number | string>(1);
  const [generatedData, setGeneratedData] = useState<any[]>([]);

  const handleGenerate = (count: number | string) => {
    const parsedCount = Number(count) || 1;
    const newData = [];
    for (let i = 0; i < parsedCount; i++) {
      const genderMap: Record<string, 'male' | 'female' | undefined> = {
        'ذكر': 'male',
        'أنثى': 'female',
        'عشوائي': undefined
      };
      
      const govCode = Object.keys(governorates).find(key => governorates[key as keyof typeof governorates] === genGov);
      
      newData.push(generateMockClientData({
        governorateCode: govCode,
        gender: genderMap[genGender],
        ageGroup: genAge,
        category: genCategory,
        service: genService,
        region: genRegion,
        branch: genBranch
      }));
    }
    setGeneratedData(newData);
  };

  const handleUseGeneratedData = () => {
    setMockData(generatedData);
    setTotal(generatedData.length);
    setActiveTab('booking');
    
    // Create a mock file to satisfy the startAutomation requirement
    const worksheet = xlsx.utils.json_to_sheet(generatedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const mockFile = new File([blob], "generated_mock_data.xlsx", { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    setFile(mockFile);
    setStatus('idle');
    setResults([]);
    setScreenshots([]);
    setLogs(['[SYSTEM] تم تحميل البيانات المولدة بنجاح. يمكنك الآن بدء التشغيل.']);
  };

  const downloadGeneratedData = () => {
    if (generatedData.length === 0) return;
    const worksheet = xlsx.utils.json_to_sheet(generatedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    xlsx.writeFile(workbook, "generated_clients_data.xlsx");
  };

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const generateMockData = () => {
    const data = [
      generateMockClientData({
        governorateCode: "01", 
        gender: "male", 
        ageGroup: "26-35",
        category: "الخزينة",
        service: "سحب نقدي",
        region: "مدينة نصر",
        branch: "مكرم عبيد 140"
      }),
      generateMockClientData({
        governorateCode: "01", 
        gender: "female", 
        ageGroup: "18-25",
        category: "خدمة العملاء",
        service: "صناديق استثمار / أضوراق مالية",
        region: "مدينة نصر",
        branch: "عباس العقاد 073"
      }),
      generateMockClientData({
        governorateCode: "01", 
        gender: "male", 
        ageGroup: "46-60",
        category: "الاستقبال",
        service: "الاستقبال / خدمات أخر",
        region: "مدينة نصر",
        branch: "سيتي ستارز 139"
      })
    ];
    
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    
    const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const mockFile = new File([blob], "mock_data.xlsx", { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    setFile(mockFile);
    setMockData(data);
    setStatus('idle');
    setResults([]);
    setScreenshots([]);
    setLogs(['[SYSTEM] تم توليد البيانات التجريبية بنجاح.']);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const uploadedFile = e.target.files[0];
      setFile(uploadedFile);
      setStatus('idle');
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = xlsx.utils.sheet_to_json(ws);
        setMockData(data);
        setLogs([`[SYSTEM] تم تحميل ملف Excel بنجاح: ${uploadedFile.name}`]);
      };
      reader.readAsBinaryString(uploadedFile);
    }
  };

  const startAutomation = async () => {
    if (!file) return;
    
    setStatus('uploading');
    setLogs(prev => [...prev, '[INFO] جاري التحقق من استقرار الاتصال...']);
    
    // Add a connection pre-check to see if cookies are alive
    try {
      const checkSignal = AbortController ? new AbortController() : null;
      const checkTimeout = checkSignal ? setTimeout(() => checkSignal.abort(), 8000) : null;
      
      const checkRes = await fetch('/api/auth-status', { signal: checkSignal?.signal }).catch(() => null);
      if (checkTimeout) clearTimeout(checkTimeout);

      if (!checkRes || !checkRes.ok) {
        const text = checkRes ? await checkRes.text() : '';
        if (text.includes('Cookie check') || !checkRes) {
          throw new Error('AUTH_BLOCK');
        }
      }
    } catch (e: any) {
      if (e.message === 'AUTH_BLOCK' || e.name === 'AbortError') {
        setLogs(prev => [...prev, '❌ تم اكتشاف حظر الاتصال من المتصفح.']);
        setStatus('error');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          setLogs(prev => [...prev, '[SYSTEM] جاري إعادة توجيهك لصفحة الإصلاح...']);
          setTimeout(() => {
            window.location.href = `/api/mobile-fix?returnTo=${encodeURIComponent(window.location.href)}`;
          }, 2000);
        } else {
          setLogs(prev => [...prev, '💡 يرجى الضغط على "إصلاح الاتصال" أو افتح التطبيق في نافذة جديدة.']);
        }
        return;
      }
    }

    setLogs(prev => [...prev, '[INFO] جاري رفع الملف...']);
    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        console.error('Upload failed with status:', uploadRes.status, text);
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }
      
      const responseText = await uploadRes.text();
      
      if (responseText.includes('<title>Cookie check</title>') || responseText.includes('auth_flow_may_set_cookies')) {
        setLogs(prev => [...prev, '❌ خطأ حماية: المتصفح يمنع الاتصال.']);
        setLogs(prev => [...prev, '[SYSTEM] جاري محاولة إصلاح الاتصال...']);
        
        // Show a more prominent error in the UI
        setStatus('error');
        
        // Specifically for mobile, try to guide them to open in a new tab
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          setLogs(prev => [...prev, '💡 نصيحة للموبايل: اضغط على أيقونة السهم (أعلى اليمين) لفتح التطبيق في صفحة مستقلة، أو اضغط على زر "إصلاح الاتصال" في السجل.']);
          // Attempt automatic fix
          setTimeout(() => {
            window.location.href = `/api/mobile-fix?returnTo=${encodeURIComponent(window.location.href)}`;
          }, 2000);
        } else {
          setLogs(prev => [...prev, '💡 يرجى الضغط على زر "إصلاح الاتصال" أو فتح التطبيق في نافذة جديدة.']);
        }
        return;
      }

      let taskId, totalRows;
      try {
        const data = JSON.parse(responseText);
        taskId = data.taskId;
        totalRows = data.totalRows;
      } catch (e) {
        console.error('Failed to parse JSON response:', responseText);
        setLogs(prev => [...prev, '❌ خطأ: استجابة غير صالحة من الخادم.']);
        setStatus('error');
        return;
      }

      setTaskId(taskId);
      setTotal(totalRows);
      setStatus('ready');
      setLogs(prev => [...prev, '[SUCCESS] تم الرفع بنجاح. جاري الاتصال بالخادم...']);
      
      const eventSource = new EventSource(`/api/stream/${taskId}`, { withCredentials: true });
      
      eventSource.onmessage = (event) => {
        try {
          // Detect HTML auth error in stream
          if (event.data && typeof event.data === 'string' && event.data.includes('Cookie check')) {
            throw new Error('AuthRequired');
          }
          const data = JSON.parse(event.data);
          
          if (data.type === 'INIT') {
            setLogs(prev => [...prev, '[SYSTEM] تم إنشاء اتصال SSE، جاري طلب بدء الأتمتة...']);
            fetch(`/api/start/${taskId}`, { method: 'POST' })
              .then(async (res) => {
                const text = await res.text();
                
                if (text.includes('<title>Cookie check</title>') || text.includes('auth_flow_may_set_cookies')) {
                  throw new Error('AuthRequired');
                }

                try {
                  const result = JSON.parse(text);
                  if (res.ok) {
                    setLogs(prev => [...prev, `[SUCCESS] ${result.message || 'بدأت المهمة بنجاح.'}`]);
                  } else {
                    setLogs(prev => [...prev, `[ERROR] فشل بدء المهمة برمجياً: ${result.error || 'خطأ غير معروف'}`]);
                    setStatus('error');
                  }
                } catch (e) {
                  throw new Error(`Invalid JSON: ${text.substring(0, 50)}...`);
                }
              })
              .catch(err => {
                console.error('Failed to start task:', err);
                if (err.message === 'AuthRequired') {
                  setLogs(prev => [...prev, '❌ خطأ حماية: المتصفح يمنع الاتصال. جاري الإصلاح...']);
                  // Trigger mobile fix
                  setTimeout(() => {
                    window.location.href = `/api/mobile-fix?returnTo=${encodeURIComponent(window.location.href)}`;
                  }, 1500);
                } else {
                  setLogs(prev => [...prev, `[ERROR] خطأ تقني في الاتصال: ${err.message}`]);
                }
                setStatus('error');
              });
            setStatus('running');
            setLogs(prev => [...prev, '[INFO] جاري تحضير المحرك (Playwright)...']);
          } else if (data.type === 'LOG') {
          setLogs(prev => [...prev, `[PROCESS] ${data.message}`]);
        } else if (data.type === 'PROGRESS') {
          setProgress(data.progress);
          setResults(prev => [...prev, data.result]);
        } else if (data.type === 'SCREENSHOT') {
          setScreenshots(prev => [{ image: data.image, caption: data.caption, isError: data.isError }, ...prev].slice(0, 50));
          setSelectedScreenshotIndex(0);
          if (data.isTicket) {
            setTickets(prev => [{ image: data.image, caption: data.caption }, ...prev]);
          }
        } else if (data.type === 'COMPLETE') {
          setStatus('completed');
          setLogs(prev => [...prev, '[SUCCESS] تم الانتهاء من جميع العمليات!']);
          eventSource.close();
        }
      } catch (err: any) {
        if (err.message === 'AuthRequired') {
          setLogs(prev => [...prev, '❌ الاتصال المباشر مقطوع. جاري إصلاح الاتصال...']);
          setStatus('error');
          eventSource.close();
          
          // Redirect to mobile-safe fix
          setTimeout(() => {
            window.location.href = `/api/mobile-fix?returnTo=${encodeURIComponent(window.location.href)}`;
          }, 1500);
        } else {
          console.error("Stream parse error:", err, event.data);
        }
      }
    };

      eventSource.onerror = () => {
        setLogs(prev => [...prev, '[ERROR] انقطع الاتصال بالخادم.']);
        setStatus('error');
        eventSource.close();
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        setLogs(prev => [...prev, '[ERROR] انتهت مهلة الرفع (Timeout). المتصفح يواجه مشكلة في الاتصال بالسيرفر. يرجى استخدام "إصلاح الاتصال".']);
      } else {
        setLogs(prev => [...prev, `[ERROR] خطأ: ${error.message}`]);
      }
      setStatus('error');
    }
  };

  const downloadResults = () => {
    if (results.length === 0) return;
    const worksheet = xlsx.utils.json_to_sheet(results);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Results");
    xlsx.writeFile(workbook, "booking_results.xlsx");
  };

  const downloadTemplate = () => {
    const data = [{
      "الرقم القومي": "",
      "الهاتف": "",
      "البريد": "",
      "المحافظة": "",
      "المنطقة": "",
      "الفرع": "",
      "القسم": "",
      "الخدمة": ""
    }];
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Template");
    xlsx.writeFile(workbook, "nbe_booking_template.xlsx");
  };

  const downloadAllTicketsPdf = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pageWidth - 2 * margin;

    pdf.setFontSize(16);
    pdf.text('جميع التذاكر المحجوزة', pageWidth / 2, margin, { align: 'center' });
    
    let yPos = margin + 15;

    // We need to know image dimensions for proportions. 
    // Since we only have base64, we create an image object to get natural dimensions
    const getImageDimensions = (base64: string): Promise<{width: number, height: number}> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.src = `data:image/jpeg;base64,${base64}`;
      });
    };

    for (let idx = 0; idx < tickets.length; idx++) {
      const t = tickets[idx];
      const imgData = `data:image/jpeg;base64,${t.image}`;
      
      const { width, height } = await getImageDimensions(t.image);
      const ratio = height / width;
      const imgHeight = imgWidth * ratio; // Maintain aspect ratio

      if (yPos + imgHeight + 15 > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight);
      
      pdf.setFontSize(10);
      pdf.text(t.caption || `Ticket ${idx + 1}`, pageWidth / 2, yPos + imgHeight + 5, { align: 'center' });
      
      yPos += imgHeight + 20;
    }
    pdf.save('all_tickets.pdf');
  };


  const successfulCount = results.filter(r => r['حالة الحجز'] === 'ناجح').length;
  const failedCount = results.filter(r => r['حالة الحجز'] === 'فشل').length;
  const pendingCount = total > 0 ? total - progress : 0;

  const resetApp = () => {
    setStatus('idle');
    setLogs([]);
    setResults([]);
    setScreenshots([]);
    setProgress(0);
    setTotal(0);
    setTaskId(null);
    setFile(null);
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full overflow-hidden bg-[#f4f7f6] text-slate-700 font-sans" dir="rtl">
      
      {/* Sidebar (Desktop Only) */}
      <div className="hidden md:flex flex-col inset-y-0 right-0 z-50 w-[260px] bg-slate-800 text-white p-5 gap-5 border-l border-white/10 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-[#c39c43] flex items-center gap-2">
            <Shield className="w-5 h-5" />
            NBE Automator Pro
          </h2>
        </div>

        <div className="flex flex-col gap-2 mb-2">
          <button 
            onClick={() => setActiveTab('booking')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === 'booking' ? 'bg-[#c39c43] text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            <Activity className="w-4 h-4" />
            محرك الحجز
          </button>
          <button 
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === 'generator' ? 'bg-[#c39c43] text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            <Users className="w-4 h-4" />
            منشئ البيانات (Mock)
          </button>
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === 'tickets' ? 'bg-[#c39c43] text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            <Ticket className="w-4 h-4" />
            محفظة التذاكر
            {tickets.length > 0 && (
              <span className="mr-auto bg-[#c39c43] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{tickets.length}</span>
            )}
          </button>
        </div>
        
        <div className="bg-white/5 p-3 rounded-lg text-sm hidden md:block">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Monitor className="w-4 h-4"/> محرك التصفح (Playwright)</label>
          <select className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]">
            <option>Chromium (Stealth)</option>
            <option>Firefox</option>
          </select>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm hidden md:block">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Monitor className="w-4 h-4"/> User-Agent Profile</label>
          <select className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]" defaultValue="iPhone / Safari v17">
            <option>iPhone / Safari v17</option>
            <option>Windows / Chrome v119</option>
            <option>Mac / Safari v17</option>
          </select>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm hidden md:block">
          <label className="flex items-center gap-2 opacity-80 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#c39c43]" />
            <Shield className="w-4 h-4"/> تمكين الـ Stealth
          </label>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm hidden md:block">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Clock className="w-4 h-4"/> تأخير العمليات (Seconds)</label>
          <input type="number" defaultValue="2.5" min="1" max="10" className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]" />
        </div>

        <div className="mt-auto hidden md:block">
          <button onClick={downloadTemplate} className="w-full py-2.5 px-4 bg-transparent border border-white/20 text-white rounded-md hover:bg-white/10 transition-colors font-semibold text-sm flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" /> تحميل قالب الإكسيل
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 md:gap-5 overflow-y-auto pb-24 md:pb-6 relative w-full">
        
        {/* Screenshot Modal */}
        {selectedScreenshotForModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedScreenshotForModal(null)}
          >
            <div className="bg-slate-900 rounded-lg p-4 max-w-2xl w-full border border-slate-700 relative" onClick={(e) => e.stopPropagation()}>
              <button className="text-white absolute top-2 right-2 p-2" onClick={() => setSelectedScreenshotForModal(null)}>X</button>
              <img src={`data:image/jpeg;base64,${selectedScreenshotForModal.image}`} className="w-full" />
              <p className="text-white mt-2">{selectedScreenshotForModal.caption}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white py-3 md:py-4 px-4 md:px-6 rounded-xl shadow-sm border border-slate-200 shrink-0 gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-[#007a33]">نظام أتمتة البنك الأهلي</h1>
              <p className="text-[11px] md:text-xs text-slate-500 mt-0.5 md:mt-1">وضع المطور المتقدم</p>
            </div>
            
            {/* Status pill on mobile - moved to right of header */}
            <div className={`flex md:hidden px-3 py-1.5 rounded-full text-[10px] font-bold items-center gap-1.5 transition-colors ${
              status === 'running' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
              status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              {(status === 'idle' || status === 'ready' || status === 'uploading') && <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></div>}
              {status === 'running' ? 'جاري التنفيذ' : status === 'completed' ? 'اكتمل' : status === 'error' ? 'خطأ' : 'جاهز'}
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button 
              onClick={resetApp}
              className="px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-md text-sm sm:text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto"
            >
              <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> إعادة ضبط النظام
            </button>
            <div className={`hidden md:flex px-3 py-1.5 rounded-full text-xs font-bold items-center gap-2 transition-colors ${
            status === 'running' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
            status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-slate-100 text-slate-600 border border-slate-200'
          }`}>
            {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
            {(status === 'idle' || status === 'ready' || status === 'uploading') && <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></div>}
            
            {status === 'idle' && 'في انتظار الملف'}
            {status === 'uploading' && 'جاري الرفع...'}
            {status === 'ready' && 'جاهز للبدء'}
            {status === 'running' && 'جاري التنفيذ...'}
            {status === 'completed' && 'اكتملت العملية'}
            {status === 'error' && 'حدث خطأ'}
          </div>
        </div>
      </div>

        <AnimatePresence mode="wait">
        {activeTab === 'booking' && (
          <motion.div 
            key="booking"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4 md:gap-5"
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 shrink-0">
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#007a33]">{total > 0 ? total : '-'}</div>
            <div className="text-xs text-slate-500 mt-1">إجمالي الطلبات</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-700">{successfulCount > 0 ? successfulCount : '-'}</div>
            <div className="text-xs text-slate-500 mt-1">تم بنجاح</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
            <div className="text-2xl font-bold text-red-500">{failedCount > 0 ? failedCount : '-'}</div>
            <div className="text-xs text-slate-500 mt-1">فشل</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
            <div className="text-2xl font-bold text-blue-500">{pendingCount > 0 ? pendingCount : '-'}</div>
            <div className="text-xs text-slate-500 mt-1">قيد الانتظار</div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-5 shrink-0">
          
          {/* Upload Section */}
          <div className="lg:col-span-2 bg-white rounded-xl p-5 border-2 border-dashed border-slate-300 flex flex-col justify-center items-center text-center shadow-sm">
            <div className="text-5xl mb-3">📊</div>
            <p className="font-bold text-slate-700 mb-1">اسحب ملف بيانات العملاء هنا</p>
            <p className="text-xs text-slate-500 mb-4">يدعم صيغ .xlsx, .csv</p>
            
            <label className="cursor-pointer w-full mb-3">
              <div className="w-full py-2.5 px-4 bg-[#f4f7f6] border border-slate-200 text-slate-700 rounded-md hover:bg-slate-100 transition-colors font-semibold text-sm flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> اختر ملف
              </div>
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
            </label>

            <div className="flex gap-2 w-full">
              <button 
                onClick={startAutomation}
                disabled={!file || status === 'running' || status === 'uploading'}
                className="flex-1 py-2.5 px-4 bg-[#007a33] text-white rounded-md hover:bg-[#00632a] disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {status === 'running' ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري...</>
                ) : (
                  <><Play className="w-4 h-4" /> بدء الأتمتة</>
                )}
              </button>
              {status === 'completed' && taskId ? (
                <a
                  href={`/api/export/${taskId}`}
                  download
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" /> تحميل النتيجة
                </a>
              ) : (
                <button 
                  onClick={generateMockData}
                  className="flex-1 py-2.5 px-4 bg-[#f4f7f6] border border-slate-200 text-slate-700 rounded-md hover:bg-slate-100 transition-colors font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" /> بيانات تجريبية
                </button>
              )}
            </div>
            {file && <p className="text-xs text-[#007a33] font-medium mt-3 w-full truncate">الملف: {file.name}</p>}
          </div>

          {/* Execution Monitor */}
          <div className="lg:col-span-3 bg-slate-800 rounded-xl p-4 text-slate-300 flex flex-col font-mono shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-slate-400" /> سجل العمليات (Live Logs)
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile) {
                      window.location.href = `/api/mobile-fix?returnTo=${encodeURIComponent(window.location.href)}`;
                    } else {
                      window.open('/api/auth-fix', '_blank', 'width=400,height=300');
                    }
                  }}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-200 text-[10px] px-2 py-1 rounded border border-red-500/30 flex items-center gap-1 transition-colors"
                  title="حل مشكلة Cookie Check"
                >
                  <Shield className="w-3 h-3" /> إصلاح الاتصال
                </button>
                <div className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded-md border border-slate-700">
                  <span className="text-[10px] text-slate-400">التقدم:</span>
                  <span className="text-xs text-[#c39c43] font-bold font-mono">{total > 0 ? Math.round((progress / total) * 100) : 0}%</span>
                </div>
              </div>
            </div>
            
            <div className="w-full bg-slate-900 h-3 rounded-full mb-3 overflow-hidden border border-slate-700 relative shadow-inner">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-[#c39c43] to-[#e5c06a] relative overflow-hidden"
                initial={{ width: 0 }}
                animate={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {status === 'running' && (
                  <motion.div 
                    className="absolute inset-0 bg-white/20"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    style={{ skewX: -20 }}
                  />
                )}
              </motion.div>
            </div>

            <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-1.5 min-h-[140px] max-h-[180px] pr-2 custom-scrollbar bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic flex items-center justify-center h-full gap-2">
                  <Clock className="w-4 h-4 opacity-50" /> في انتظار بدء العمليات...
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {logs.map((log, i) => {
                    let Icon = Info;
                    let colorClass = "text-blue-300 bg-blue-400/10 border-blue-400/20";
                    let iconColor = "text-blue-400";
                    let cleanLog = log;

                    if (log.includes('[SUCCESS]')) {
                      Icon = CheckCircle;
                      colorClass = "text-green-400 bg-green-400/10 border-green-400/20";
                      iconColor = "text-green-400";
                      cleanLog = log.replace('[SUCCESS]', '').trim();
                    } else if (log.includes('[ERROR]')) {
                      Icon = XCircle;
                      colorClass = "text-red-400 bg-red-400/10 border-red-400/20";
                      iconColor = "text-red-400";
                      cleanLog = log.replace('[ERROR]', '').trim();
                    } else if (log.includes('[WARNING]')) {
                      Icon = AlertTriangle;
                      colorClass = "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
                      iconColor = "text-yellow-400";
                      cleanLog = log.replace('[WARNING]', '').trim();
                    } else if (log.includes('[INFO]')) {
                      Icon = Info;
                      colorClass = "text-blue-300 bg-blue-400/10 border-blue-400/20";
                      iconColor = "text-blue-400";
                      cleanLog = log.replace('[INFO]', '').trim();
                    } else if (log.includes('[PROCESS]')) {
                      Icon = Loader2;
                      colorClass = "text-slate-300 bg-slate-800 border-slate-700";
                      iconColor = "text-slate-400";
                      cleanLog = log.replace('[PROCESS]', '').trim();
                    } else if (log.includes('[SYSTEM]')) {
                      Icon = Settings;
                      colorClass = "text-purple-300 bg-purple-400/10 border-purple-400/20";
                      iconColor = "text-purple-400";
                      cleanLog = log.replace('[SYSTEM]', '').trim();
                    }

                    return (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`flex items-start gap-2 p-2 rounded border ${colorClass}`}
                      >
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor} ${Icon === Loader2 && status === 'running' && i === logs.length - 1 ? 'animate-spin' : ''}`} />
                        <span className="flex-1 font-mono">{cleanLog}</span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
              <div ref={logsEndRef} />
            </div>

            <div className="w-full h-[180px] bg-slate-900 rounded-lg mt-3 relative overflow-hidden flex items-center justify-center border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors"
                 onClick={() => screenshots.length > 0 && setSelectedScreenshotForModal(screenshots[selectedScreenshotIndex])}>
              <span className="absolute top-1.5 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded z-10 max-w-[90%] truncate">
                {screenshots.length > 0 ? screenshots[selectedScreenshotIndex]?.caption : 'Debug View'}
              </span>
              {screenshots.length > 0 && screenshots[selectedScreenshotIndex] ? (
                <img 
                  src={`data:image/jpeg;base64,${screenshots[selectedScreenshotIndex].image}`} 
                  alt="Selected Screenshot" 
                  className="w-full h-full object-contain opacity-90"
                />
              ) : (
                <div className="text-slate-600 text-xs flex flex-col items-center gap-2">
                  <Monitor className="w-6 h-6 opacity-50" />
                  IMAGE_RECOVERY_MODE_ACTIVE
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/50 transition-opacity">
                <span className="text-white text-xs font-bold flex items-center gap-1">ضغطة للتكبير</span>
              </div>
            </div>

            {/* Thumbnail History Strip */}
            {screenshots.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto custom-scrollbar pb-1">
                {screenshots.map((shot, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedScreenshotIndex(idx)}
                    className={`relative w-16 h-12 shrink-0 rounded border cursor-pointer overflow-hidden transition-all ${selectedScreenshotIndex === idx ? 'border-[#c39c43] ring-1 ring-[#c39c43] opacity-100' : 'border-slate-700 opacity-50 hover:opacity-100'}`}
                    title={shot.caption}
                  >
                    <img src={`data:image/jpeg;base64,${shot.image}`} className="w-full h-full object-cover" />
                    {shot.isError && <div className="absolute inset-0 border-2 border-red-500 rounded"></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results Data */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-auto flex-1">
            {/* Mobile View: Stacked Cards */}
            <div className="md:hidden flex flex-col divide-y divide-slate-100">
              {results.length === 0 && mockData.length > 0 && status === 'idle' ? (
                mockData.slice(0, 5).map((row, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-800 text-sm">معاينة: {row['الخدمة']}</span>
                      <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{row['الرقم القومي'] || row['National ID']}</span>
                    </div>
                  </div>
                ))
              ) : results.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">
                  لا توجد نتائج لعرضها حالياً
                </div>
              ) : (
                results.map((row, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-800 text-sm">{row['الخدمة']}</span>
                      <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{row['الرقم القومي'] || row['National ID']}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-bold px-2 py-1 rounded w-fit ${row['حالة الحجز'] === 'ناجح' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {row['حالة الحجز']}
                      </span>
                      <span className="text-slate-500 max-w-[60%] text-left truncate">{row['ملاحظات']}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop View: Table */}
            <table className="hidden md:table w-full text-sm text-right">
              <thead className="sticky top-0 bg-slate-50 text-slate-700 text-xs uppercase border-b border-slate-200 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">الرقم القومي</th>
                  <th className="px-4 py-3 font-semibold">الخدمة</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.length === 0 && mockData.length > 0 && status === 'idle' ? (
                  mockData.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">{row['الرقم القومي'] || row['National ID']}</td>
                      <td className="px-4 py-3 text-slate-600">{row['الخدمة']}</td>
                      <td className="px-4 py-3 text-slate-400 italic">-</td>
                      <td className="px-4 py-3 text-slate-400 italic">معاينة بيانات</td>
                    </tr>
                  ))
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                      لا توجد نتائج لعرضها حالياً
                    </td>
                  </tr>
                ) : (
                  results.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{row['الرقم القومي'] || row['National ID']}</td>
                      <td className="px-4 py-3 text-slate-600">{row['الخدمة']}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${row['حالة الحجز'] === 'ناجح' ? 'text-green-500' : 'text-red-500'}`}>
                          {row['حالة الحجز']}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{row['ملاحظات']}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
            <button
              onClick={downloadResults}
              disabled={results.length === 0}
              className="py-2 px-4 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" /> تحميل تقرير النتائج (CSV)
            </button>
          </div>
        </div>
        </motion.div>
        )}
        
        {activeTab === 'generator' && (
          <motion.div 
            key="generator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-3xl mx-auto w-full"
          >
            {/* Warning Banner */}
            <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-l-lg mb-6 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-red-800 font-bold">تحذير هام</h3>
                <p className="text-red-700 text-sm mt-1">
                  هذا التطبيق لأغراض التدريب والتعليم فقط. لا يمكن استخدام النتائج لأي أغراض رسمية أو قانونية. الأرقام المولدة هي أرقام وهمية تتبع الخوارزمية فقط.
                </p>
              </div>
            </div>

            {/* Generator Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  إعدادات إنشاء البطاقة
                </h3>
              </div>
              
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">محافظة الميلاد:</label>
                    <select 
                      value={genGov}
                      onChange={(e) => {
                        setGenGov(e.target.value);
                        setGenRegion('');
                        setGenBranch('');
                      }}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                    >
                      <option value="عشوائي">عشوائي</option>
                      {Object.values(governorates).map(gov => (
                        <option key={gov} value={gov}>{gov}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">الجنس:</label>
                    <select 
                      value={genGender}
                      onChange={(e) => setGenGender(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                    >
                      <option value="عشوائي">عشوائي</option>
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">الفئة العمرية:</label>
                    <select 
                      value={genAge}
                      onChange={(e) => setGenAge(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                    >
                      <option value="عشوائي">عشوائي</option>
                      {Object.keys(ageGroups).map(age => (
                        <option key={age} value={age}>{age} سنة</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">القسم:</label>
                    <select 
                      value={genCategory}
                      onChange={(e) => {
                        setGenCategory(e.target.value);
                        setGenService('عشوائي'); // Reset service on category change
                      }}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                    >
                      <option value="عشوائي">عشوائي</option>
                      {Object.keys(categoriesMap).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">الخدمة:</label>
                    <select 
                      value={genService}
                      onChange={(e) => setGenService(e.target.value)}
                      disabled={genCategory === 'عشوائي'}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white disabled:opacity-50 disabled:bg-slate-50"
                    >
                      <option value="عشوائي">عشوائي</option>
                      {genCategory !== 'عشوائي' && Object.keys(categoriesMap).includes(genCategory) && 
                        categoriesMap[genCategory as keyof typeof categoriesMap].map(srv => (
                          <option key={srv} value={srv}>{srv}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">المنطقة (اختياري):</label>
                    {regionsMap[genGov] ? (
                      <select 
                        value={genRegion}
                        onChange={(e) => {
                          setGenRegion(e.target.value);
                          setGenBranch(''); 
                        }}
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                      >
                        <option value="">اتركه فارغاً لتعيين تلقائي</option>
                        {Object.keys(regionsMap[genGov]).map(reg => (
                          <option key={reg} value={reg}>{reg}</option>
                        ))}
                        <option value="custom">كتابة منطقة أخرى...</option>
                      </select>
                    ) : null}
                    
                    {(!regionsMap[genGov] || genRegion === 'custom') && (
                      <input 
                        type="text" 
                        placeholder="اتركه فارغاً لتعيين تلقائي"
                        value={genRegion === 'custom' ? '' : genRegion}
                        onChange={(e) => setGenRegion(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-right mt-2"
                        dir="rtl"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">الفرع (اختياري):</label>
                    {(regionsMap[genGov] && regionsMap[genGov][genRegion]) ? (
                      <select 
                        value={genBranch}
                        onChange={(e) => setGenBranch(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                      >
                        <option value="">اتركه فارغاً لتعيين تلقائي</option>
                        {regionsMap[genGov][genRegion].map(br => (
                          <option key={br} value={br}>{br}</option>
                        ))}
                        <option value="custom">كتابة فرع آخر...</option>
                      </select>
                    ) : null}

                    {(!(regionsMap[genGov] && regionsMap[genGov][genRegion]) || genBranch === 'custom') && (
                      <input 
                        type="text" 
                        placeholder="اتركه فارغاً لتعيين تلقائي"
                        value={genBranch === 'custom' ? '' : genBranch}
                        onChange={(e) => setGenBranch(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-right mt-2"
                        dir="rtl"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">عدد البطاقات:</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="100"
                      value={genCount}
                      onChange={(e) => setGenCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-wrap gap-3 justify-center border-t border-slate-100">
                  <button 
                    onClick={() => handleGenerate(1)}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    إنشاء بطاقة واحدة
                  </button>
                  <button 
                    onClick={() => handleGenerate(genCount)}
                    className="px-6 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                  >
                    إنشاء مجموعة ({genCount || 1})
                  </button>
                  <button 
                    onClick={downloadGeneratedData}
                    disabled={generatedData.length === 0}
                    className="px-6 py-2.5 bg-emerald-600 disabled:bg-emerald-300 text-white flex gap-2 items-center font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Download className="w-5 h-5"/>
                    تحميل البيانات (Excel)
                  </button>
                  <button 
                    onClick={() => {
                      setGenGov('القاهرة');
                      setGenGender('عشوائي');
                      setGenAge('عشوائي');
                      setGenCategory('عشوائي');
                      setGenService('عشوائي');
                      setGenRegion('مدينة نصر');
                      setGenBranch('');
                      setGenCount(1);
                      setGeneratedData([]);
                    }}
                    className="px-6 py-2.5 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    إعادة تعيين
                  </button>
                </div>
              </div>
            </div>

            {/* Results Table */}
            {generatedData.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">البيانات المولدة ({generatedData.length})</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={downloadGeneratedData}
                      className="px-4 py-2 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-lg hover:bg-indigo-200 transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      تحميل (Excel)
                    </button>
                    <button 
                      onClick={handleUseGeneratedData}
                      className="px-4 py-2 bg-[#007a33] text-white text-sm font-bold rounded-lg hover:bg-[#006228] transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      استخدام البيانات
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="md:hidden divide-y divide-slate-100">
                    {generatedData.map((row, idx) => (
                      <div key={idx} className="p-4 space-y-2 bg-white">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-slate-800 text-sm">{row['الاسم']}</span>
                          <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{row['الرقم القومي']}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                          <div><span className="opacity-70">المحافظة:</span> {row['المحافظة']}</div>
                          <div><span className="opacity-70">الهاتف:</span> <span dir="ltr">{row['الهاتف']}</span></div>
                          <div className="col-span-2"><span className="opacity-70">الخدمة:</span> <span className="font-medium text-slate-800">{row['الخدمة']}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <table className="hidden md:table w-full text-sm text-right">
                    <thead className="bg-slate-100 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-3">الرقم القومي</th>
                        <th className="px-4 py-3">الاسم</th>
                        <th className="px-4 py-3">المحافظة</th>
                        <th className="px-4 py-3">الهاتف</th>
                        <th className="px-4 py-3">الخدمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {generatedData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-indigo-600 font-medium">{row['الرقم القومي']}</td>
                          <td className="px-4 py-3 text-slate-800">{row['الاسم']}</td>
                          <td className="px-4 py-3 text-slate-600">{row['المحافظة']}</td>
                          <td className="px-4 py-3 text-slate-600" dir="ltr">{row['الهاتف']}</td>
                          <td className="px-4 py-3 text-slate-600">{row['الخدمة']}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Tickets Gallery Tab */}
        {activeTab === 'tickets' && (
          <motion.div 
            key="tickets"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-5xl mx-auto w-full h-full flex flex-col pt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#c39c43]/10 rounded-xl">
                  <Ticket className="w-8 h-8 text-[#c39c43]" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">محفظة التذاكر المحجوزة</h2>
                  <p className="text-sm text-slate-500 mt-1">تجد هنا جميع صور التذاكر التي تم استخراجها بنجاح لمختلف العملاء.</p>
                </div>
              </div>
              <button 
                onClick={downloadAllTicketsPdf}
                className="bg-[#007a33] text-white px-4 py-2 rounded-lg hover:bg-[#00632a] flex items-center gap-2 text-sm font-bold shadow-sm"
              >
                <FileType className="w-4 h-4" /> تحميل الكل (PDF)
              </button>
            </div>

            {tickets.length === 0 ? (
              <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 bg-white shadow-sm mb-6">
                <Ticket className="w-16 h-16 mb-4 opacity-30" />
                <h3 className="text-lg font-bold">لا توجد تذاكر مسجلة بعد</h3>
                <p className="text-sm mt-2 max-w-sm text-center">بمجرد بدء عملية الحجز التلقائي واستخراج التذاكر بنجاح، ستظهر هنا للإدارة والتحميل.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pb-6 pr-2">
                {tickets.map((t, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm flex items-center justify-between gap-3 md:hidden">
                    <span className="font-bold text-xs truncate max-w-[60%]">{t.caption}</span>
                    <a 
                        href={`data:image/jpeg;base64,${t.image}`} 
                        download={`ticket_${idx}.jpg`}
                        className="bg-[#007a33] text-white p-2 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                  </div>
                ))}
                
                <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-6">
                  {tickets.map((t, idx) => (
                    <div key={idx} className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col p-3 gap-3">
                      <div className="w-full h-64 bg-slate-100 relative rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                        <img src={`data:image/jpeg;base64,${t.image}`} alt="Ticket" className="w-full h-full object-contain" />
                      </div>
                      <div className="font-bold text-sm text-center truncate px-2" title={t.caption}>{t.caption}</div>
                      <a href={`data:image/jpeg;base64,${t.image}`} download={`ticket_${idx}.jpg`} className="w-full bg-[#007a33] text-white py-2 rounded-lg flex items-center justify-center gap-2 font-bold text-sm">
                        <Download className="w-4 h-4" /> تحميل
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>

      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-50 px-2 pb-safe">
        <div className="flex justify-around items-center h-16">
          <button 
            onClick={() => setActiveTab('booking')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'booking' ? 'text-[#007a33]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold">الحجز</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('generator')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'generator' ? 'text-[#007a33]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users className="w-6 h-6" />
            <span className="text-[10px] font-bold">منشئ البيانات</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative ${activeTab === 'tickets' ? 'text-[#007a33]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className="relative">
              <Ticket className="w-6 h-6" />
              {tickets.length > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white">
                  {tickets.length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold">تذاكري</span>
          </button>
        </div>
      </div>

    </div>
  );
}
