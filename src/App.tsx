import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Settings, Monitor, Shield, Clock, FileText, Menu, X, Info, CheckCircle, AlertTriangle, XCircle, Loader2, CreditCard, Users, Activity } from 'lucide-react';
import * as xlsx from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { governorates, ageGroups, generateMockClientData, categoriesMap } from './lib/egyptianIdGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'booking' | 'generator'>('booking');
  const [file, setFile] = useState<File | null>(null);
  const [mockData, setMockData] = useState<any[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ready' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<{ image: string, caption: string, isError: boolean }[]>([]);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number>(0);
  const [results, setResults] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Generator State
  const [genGov, setGenGov] = useState<string>('عشوائي');
  const [genGender, setGenGender] = useState<string>('عشوائي');
  const [genAge, setGenAge] = useState<string>('عشوائي');
  const [genCategory, setGenCategory] = useState<string>('عشوائي');
  const [genService, setGenService] = useState<string>('عشوائي');
  const [genRegion, setGenRegion] = useState<string>('');
  const [genBranch, setGenBranch] = useState<string>('');
  const [genCount, setGenCount] = useState<number>(1);
  const [generatedData, setGeneratedData] = useState<any[]>([]);

  const handleGenerate = (count: number) => {
    const newData = [];
    for (let i = 0; i < count; i++) {
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

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const generateMockData = () => {
    const data = [
      generateMockClientData({ governorateCode: "01", gender: "male", ageGroup: "26-35" }),
      generateMockClientData({ governorateCode: "21", gender: "female", ageGroup: "18-25" })
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
    setLogs(prev => [...prev, '[INFO] جاري رفع الملف...']);
    setScreenshots([]);
    setResults([]);
    setProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        console.error('Upload failed with status:', uploadRes.status, text);
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }
      
      const responseText = await uploadRes.text();
      
      if (responseText.includes('<title>Cookie check</title>') || responseText.includes('auth_flow_may_set_cookies')) {
        setLogs(prev => [...prev, '❌ خطأ: المتصفح يمنع الاتصال بالخادم الداخلي. يرجى فتح التطبيق في علامة تبويب جديدة (أيقونة السهم أعلى اليمين) أو السماح بملفات تعريف الارتباط (Cookies).']);
        setStatus('error');
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
            fetch(`/api/start/${taskId}`, { method: 'POST', credentials: 'omit' }).catch(err => {
              console.error('Failed to start task:', err);
            });
            setStatus('running');
          setLogs(prev => [...prev, '[INFO] تشغيل Playwright في وضع Headless...']);
        } else if (data.type === 'LOG') {
          setLogs(prev => [...prev, `[PROCESS] ${data.message}`]);
        } else if (data.type === 'PROGRESS') {
          setProgress(data.progress);
          setResults(prev => [...prev, data.result]);
        } else if (data.type === 'SCREENSHOT') {
          setScreenshots(prev => [{ image: data.image, caption: data.caption, isError: data.isError }, ...prev].slice(0, 50));
          setSelectedScreenshotIndex(0);
        } else if (data.type === 'COMPLETE') {
          setStatus('completed');
          setLogs(prev => [...prev, '[SUCCESS] تم الانتهاء من جميع العمليات!']);
          eventSource.close();
        }
      } catch (err: any) {
        if (err.message === 'AuthRequired') {
          setLogs(prev => [...prev, '❌ الاتصال المباشر مقطوع. الرجاء فتح التطبيق في علامة تبويب جديدة (Open in New Tab) لحفظ الـ Cookies بشكل سليم.']);
          setStatus('error');
          eventSource.close();
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
      setLogs(prev => [...prev, `[ERROR] خطأ: ${error.message}`]);
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

  const successfulCount = results.filter(r => r['حالة الحجز'] === 'ناجح').length;
  const failedCount = results.filter(r => r['حالة الحجز'] === 'فشل').length;
  const pendingCount = total > 0 ? total - progress : 0;

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[#f4f7f6] text-slate-700 font-sans" dir="rtl">
      
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 right-0 z-50 w-[260px] bg-slate-800 text-white p-5 flex flex-col gap-5 border-l border-white/10 shrink-0 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-[#c39c43] flex items-center gap-2">
            <Shield className="w-5 h-5" />
            NBE Automator Pro
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white hover:text-[#c39c43]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-2">
          <button 
            onClick={() => { setActiveTab('booking'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === 'booking' ? 'bg-[#c39c43] text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            <Activity className="w-4 h-4" />
            محرك الحجز
          </button>
          <button 
            onClick={() => { setActiveTab('generator'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === 'generator' ? 'bg-[#c39c43] text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            <Users className="w-4 h-4" />
            منشئ البيانات (Mock)
          </button>
        </div>
        
        <div className="bg-white/5 p-3 rounded-lg text-sm">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Monitor className="w-4 h-4"/> محرك التصفح (Playwright)</label>
          <select className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]">
            <option>Chromium (Stealth)</option>
            <option>Firefox</option>
          </select>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Monitor className="w-4 h-4"/> User-Agent Profile</label>
          <select className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]">
            <option>Windows / Chrome v119</option>
            <option>Mac / Safari v17</option>
          </select>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm">
          <label className="flex items-center gap-2 opacity-80 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#c39c43]" />
            <Shield className="w-4 h-4"/> تمكين الـ Stealth
          </label>
        </div>

        <div className="bg-white/5 p-3 rounded-lg text-sm">
          <label className="block mb-2 opacity-80 flex items-center gap-2"><Clock className="w-4 h-4"/> تأخير العمليات (Seconds)</label>
          <input type="number" defaultValue="2.5" min="1" max="10" className="w-full bg-slate-900 border border-slate-700 text-white p-1.5 rounded outline-none focus:border-[#c39c43]" />
        </div>

        <div className="mt-auto">
          <button onClick={downloadTemplate} className="w-full py-2.5 px-4 bg-transparent border border-white/20 text-white rounded-md hover:bg-white/10 transition-colors font-semibold text-sm flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" /> تحميل قالب الإكسيل
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 md:gap-5 overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white py-3 md:py-4 px-4 md:px-6 rounded-xl shadow-sm border border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-500 hover:text-[#007a33]">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-base md:text-xl font-bold text-[#007a33]">نظام أتمتة حجوزات البنك الأهلي</h1>
              <p className="text-[10px] md:text-xs text-slate-500 mt-0.5 md:mt-1">لوحة تحكم المبرمج - Senior Python Developer Mode</p>
            </div>
          </div>
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

        {activeTab === 'booking' ? (
          <>
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
              <button 
                onClick={generateMockData}
                className="flex-1 py-2.5 px-4 bg-[#f4f7f6] border border-slate-200 text-slate-700 rounded-md hover:bg-slate-100 transition-colors font-semibold text-sm flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" /> بيانات تجريبية
              </button>
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
                  onClick={() => window.open('/api/auth-fix', '_blank', 'width=400,height=300')}
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

            <div className="w-full h-[180px] bg-slate-900 rounded-lg mt-3 relative overflow-hidden flex items-center justify-center border border-slate-700">
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

        {/* Results Table */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-right">
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
        </>
        ) : (
          <div className="max-w-3xl mx-auto w-full">
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
                      onChange={(e) => setGenGov(e.target.value)}
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
                    <input 
                      type="text" 
                      placeholder="اتركه فارغاً لتعيين تلقائي"
                      value={genRegion}
                      onChange={(e) => setGenRegion(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">الفرع (اختياري):</label>
                    <input 
                      type="text" 
                      placeholder="اتركه فارغاً لتعيين تلقائي"
                      value={genBranch}
                      onChange={(e) => setGenBranch(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">عدد البطاقات:</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="100"
                      value={genCount}
                      onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
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
                    إنشاء مجموعة ({genCount})
                  </button>
                  <button 
                    onClick={() => {
                      setGenGov('عشوائي');
                      setGenGender('عشوائي');
                      setGenAge('عشوائي');
                      setGenCategory('عشوائي');
                      setGenService('عشوائي');
                      setGenRegion('');
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
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">البيانات المولدة ({generatedData.length})</h3>
                  <button 
                    onClick={handleUseGeneratedData}
                    className="px-4 py-2 bg-[#007a33] text-white text-sm font-bold rounded-lg hover:bg-[#006228] transition-colors shadow-sm flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    استخدام هذه البيانات في الحجز التلقائي
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
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
          </div>
        )}

      </div>
    </div>
  );
}
