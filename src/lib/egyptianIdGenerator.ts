export const governorates = {
  "01": "القاهرة",
  "02": "الإسكندرية",
  "03": "بورسعيد",
  "04": "السويس",
  "11": "دمياط",
  "12": "الدقهلية",
  "13": "الشرقية",
  "14": "القليوبية",
  "15": "كفر الشيخ",
  "16": "الغربية",
  "17": "المنوفية",
  "18": "البحيرة",
  "19": "الإسماعيلية",
  "21": "الجيزة",
  "22": "بني سويف",
  "23": "الفيوم",
  "24": "المنيا",
  "25": "أسيوط",
  "26": "سوهاج",
  "27": "قنا",
  "28": "أسوان",
  "29": "الأقصر",
  "31": "البحر الأحمر",
  "32": "الوادي الجديد",
  "33": "مطروح",
  "34": "شمال سيناء",
  "35": "جنوب سيناء",
  "88": "خارج الجمهورية"
};

export const regionsMap: Record<string, Record<string, string[]>> = {
  "القاهرة": {
    "مدينة نصر": [
      "نادي السكة الحديد 609",
      "جامعة الأزهر 143",
      "الطيران 135",
      "حي السفارات 076",
      "الماسة 601",
      "يوسف عباس 056",
      "البطراوى 015",
      "ذاكر حسين 053",
      "طيبة 121",
      "رابعة العدوية 125",
      "مدينة نصر 104",
      "مصطفى النحاس 052",
      "السراج مول 072",
      "عباس العقاد 073",
      "أحمد فخري 605",
      "مكرم عبيد 140",
      "ابو داود الظاهرى 021",
      "الجولف 138",
      "سيتي ستارز 139",
      "الحى العاشر 040"
    ]
  }
};

export const ageGroups = {
  "18-25": { min: 18, max: 25 },
  "26-35": { min: 26, max: 35 },
  "36-45": { min: 36, max: 45 },
  "46-60": { min: 46, max: 60 },
  "+60": { min: 61, max: 80 }
};

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomDate(minAge: number, maxAge: number) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - maxAge;
  const maxYear = currentYear - minAge;
  
  const year = getRandomInt(minYear, maxYear);
  const month = getRandomInt(1, 12);
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = getRandomInt(1, daysInMonth);
  
  return new Date(year, month - 1, day);
}

export function generateEgyptianID(options: { governorateCode?: string, gender?: 'male' | 'female', ageGroup?: string }) {
  let { governorateCode, gender, ageGroup } = options;

  // 1. Date of Birth & Century
  let minAge = 18;
  let maxAge = 80;
  if (ageGroup && ageGroup !== 'عشوائي' && ageGroups[ageGroup as keyof typeof ageGroups]) {
    minAge = ageGroups[ageGroup as keyof typeof ageGroups].min;
    maxAge = ageGroups[ageGroup as keyof typeof ageGroups].max;
  }
  
  const dob = generateRandomDate(minAge, maxAge);
  const year = dob.getFullYear();
  const century = year >= 2000 ? '3' : '2';
  const yy = String(year).slice(-2);
  const mm = String(dob.getMonth() + 1).padStart(2, '0');
  const dd = String(dob.getDate()).padStart(2, '0');

  // 2. Governorate
  if (!governorateCode || governorateCode === 'عشوائي') {
    const codes = Object.keys(governorates);
    governorateCode = codes[getRandomInt(0, codes.length - 1)];
  }

  // Generate sequence and check digit until we get a valid one (avoiding check digit 10)
  while (true) {
    // 3. Sequence & Gender
    let seq = getRandomInt(1, 999);
    let seqStr = String(seq).padStart(3, '0');
    
    let genderDigit;
    if (gender === 'male') {
      genderDigit = [1, 3, 5, 7, 9][getRandomInt(0, 4)];
    } else if (gender === 'female') {
      genderDigit = [2, 4, 6, 8][getRandomInt(0, 3)];
    } else {
      genderDigit = getRandomInt(1, 9);
    }

    const first13 = `${century}${yy}${mm}${dd}${governorateCode}${seqStr}${genderDigit}`;
    
    // 4. Calculate Check Digit
    const weights = [2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(first13[i]) * weights[i];
    }
    
    let remainder = sum % 11;
    let checkDigit = 11 - remainder;
    
    if (checkDigit === 11) checkDigit = 1;
    
    // If check digit is 10, it's often considered an invalid sequence by the government,
    // so we regenerate the sequence to be safe.
    if (checkDigit !== 10) {
      return `${first13}${checkDigit}`;
    }
  }
}

export const categoriesMap = {
  "الخزينة": [
    "استبدال عملة أجنبية",
    "إيداع نقدى",
    "ايداع بطاقات",
    "إيداع مبالغ كبيرة",
    "سحب نقدي",
    "صرف شيكات",
    "مدفوعات حكومية"
  ],
  "خدمة العملاء": [
    "التركات",
    "التمويل العقاري",
    "الخدمات الكترونية",
    "القروض",
    "تحديث البيانات",
    "تحويل لبنوك محلية",
    "خدمات البطاقات",
    "شهادات/ ودائع",
    "صناديق استثمار / أضوراق مالية",
    "فتح حساب",
    "خدمة العملاء / خدمات اخرى"
  ],
  "الاستقبال": [
    "الاوامر الادارية",
    "بطاقات",
    "تحصيل الشيكات",
    "تحويلات داخلية",
    "حوالات",
    "الاستقبال / خدمات أخر"
  ]
};

export function generateMockClientData(options: { 
  governorateCode?: string, 
  gender?: 'male' | 'female', 
  ageGroup?: string,
  category?: string,
  service?: string,
  region?: string,
  branch?: string
}) {
  const nationalId = generateEgyptianID(options);
  
  // Extract governorate from ID
  const govCode = nationalId.substring(7, 9);
  const govName = governorates[govCode as keyof typeof governorates] || "القاهرة";
  
  const firstNamesMale = ["محمد", "أحمد", "محمود", "مصطفى", "علي", "عمر", "كريم", "طارق", "ياسر", "حسام"];
  const firstNamesFemale = ["فاطمة", "مريم", "سارة", "نورهان", "آية", "منى", "هبة", "ياسمين", "دينا", "سلمى"];
  const lastNames = ["إبراهيم", "حسن", "عبدالله", "سليمان", "توفيق", "سعد", "فاروق", "عثمان", "منصور", "جاد"];
  
  const genderDigit = parseInt(nationalId.charAt(12));
  const isMale = genderDigit % 2 !== 0;
  
  const firstName = isMale ? firstNamesMale[getRandomInt(0, firstNamesMale.length - 1)] : firstNamesFemale[getRandomInt(0, firstNamesFemale.length - 1)];
  const lastName = lastNames[getRandomInt(0, lastNames.length - 1)];
  
  const phonePrefixes = ["010", "011", "012", "015"];
  const phone = phonePrefixes[getRandomInt(0, 3)] + String(getRandomInt(10000000, 99999999));
  
  const email = `client_${nationalId.substring(10)}@example.com`;
  
  const categoryKeys = Object.keys(categoriesMap);
  const selectedCategory = options.category && options.category !== 'عشوائي' 
    ? options.category 
    : categoryKeys[getRandomInt(0, categoryKeys.length - 1)];
    
  const servicesForCategory = categoriesMap[selectedCategory as keyof typeof categoriesMap] || ["خدمة عامة"];
  
  const selectedService = options.service && options.service !== 'عشوائي' 
    ? options.service 
    : servicesForCategory[getRandomInt(0, servicesForCategory.length - 1)];
    
  const selectedRegion = options.region && options.region !== 'عشوائي' && options.region.trim() !== '' 
    ? options.region 
    : (govName === "القاهرة" ? ["مدينة نصر", "مصر الجديدة", "المعادي"][getRandomInt(0, 2)] : "المنطقة الرئيسية");
    
  const selectedBranch = options.branch && options.branch !== 'عشوائي' && options.branch.trim() !== '' 
    ? options.branch 
    : `فرع ${govName} - ${selectedRegion}`;
  
  return {
    "الرقم القومي": nationalId,
    "الاسم": `${firstName} ${lastName}`,
    "الهاتف": phone,
    "البريد": email,
    "المحافظة": govName,
    "المنطقة": selectedRegion,
    "الفرع": selectedBranch,
    "القسم": selectedCategory,
    "الخدمة": selectedService
  };
}
