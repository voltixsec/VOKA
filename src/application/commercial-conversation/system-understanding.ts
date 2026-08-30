import type { WorkingCommercialDraft } from "./types";

type SystemUnderstanding = NonNullable<NonNullable<WorkingCommercialDraft["structuredResult"]>["systemUnderstanding"]>;

const knownComponents: Array<[RegExp, string, string]> = [
  [/drive|machine|traction|hydraulic|lifting|حركة|رفع/i, "مجموعة الرفع والحركة", "Drive and lifting assembly"],
  [/platform|cabin|car\b|منصة|كابينة/i, "الكابينة أو المنصة", "Cabin or platform"],
  [/controller|control panel|controls?|تحكم/i, "منظومة التحكم", "Control system"],
  [/doors?|gates?|أبواب|بوابات/i, "الأبواب والبوابات", "Doors and gates"],
  [/safety|brake|interlock|أمان|سلامة/i, "منظومة الأمان", "Safety system"],
  [/cylinders?|agent storage|أسطوان/i, "أسطوانة عامل الإطفاء", "Suppression-agent cylinder"],
  [/valves?|صمامات/i, "الصمامات وملحقات التشغيل", "Valves and operating accessories"],
  [/nozzles?|pipework|piping|فوهات|مواسير/i, "شبكة المواسير والفوهات", "Pipework and nozzles"],
  [/detection|detectors?|كشف|حساس/i, "منظومة الكشف", "Detection system"],
  [/notification|alarm|إنذار/i, "التنبيه والإنذار", "Notification and alarm"],
  [/camera|كامير/i, "الكاميرات", "Cameras"],
  [/recorder|NVR|DVR|تسجيل/i, "التسجيل وإدارة الفيديو", "Video recording and management"],
  [/storage|تخزين/i, "التخزين", "Storage"],
  [/PoE|network|switch|شبكة/i, "الشبكة والتغذية PoE", "Network and PoE"],
  [/cabl|Cat6|كابل|تمديد/i, "الكابلات والتمديدات", "Cabling"],
  [/installation|commission|تركيب|اختبار|برمجة/i, "التركيب والاختبار والتشغيل", "Installation, testing, and commissioning"],
];

function humanComponent(rawAr: string | null | undefined, rawEn: string | null | undefined) {
  const joined = `${rawAr ?? ""} ${rawEn ?? ""}`.trim();
  const known = knownComponents.find(([pattern]) => pattern.test(joined));
  if (known) return { labelAr: known[1], labelEn: known[2] };
  const labelAr = rawAr?.trim();
  const labelEn = rawEn?.trim();
  // Never leak an untranslated provider category into Arabic mode.
  if (!labelAr || /[a-z]/i.test(labelAr.replace(/FM-?200|CCTV|NVR|DVR|PoE|Cat6|IP/gi, ""))) return null;
  if (!labelEn || /[\u0600-\u06ff]/.test(labelEn)) return null;
  return { labelAr: labelAr.slice(0, 120), labelEn: labelEn.slice(0, 120) };
}

function uniqueComponents(values: Array<{ labelAr: string; labelEn: string } | null>) {
  return values.filter((value): value is { labelAr: string; labelEn: string } => Boolean(value))
    .filter((value, index, all) => all.findIndex((candidate) => candidate.labelAr === value.labelAr && candidate.labelEn === value.labelEn) === index)
    .slice(0, 8);
}

export function projectSystemUnderstanding(draft: WorkingCommercialDraft): SystemUnderstanding | null {
  const proposal = draft.canonicalProposal;
  const plan = draft.systemWorkingPlan;
  if (!proposal || !plan?.systemIdentity) return null;

  const provisional = proposal.agenticState?.provisionalSystem;
  const identity = `${plan.systemIdentity} ${provisional?.aliases.join(" ") ?? ""}`;
  const safetyCritical = /FM[-\s]?200|fire suppression|إطفاء|غاز/i.test(identity);
  const trusted = Boolean(proposal.smartSystem);
  const components = trusted
    ? uniqueComponents((proposal.smartSystem?.requirements ?? []).map((item) => humanComponent(item.nameAr, item.nameEn)))
    : uniqueComponents((provisional?.componentCategories ?? []).map((item) => humanComponent(item, item)));

  if (safetyCritical) {
    return {
      recognized: true,
      confidence: "SAFETY_CRITICAL",
      headingAr: "تم التعرف على نوع النظام",
      headingEn: "System type understood",
      descriptionAr: "فهمت التكوين العام للنظام، لكن التصميم والكميات النهائية تحتاج أبعاد الحيز والمخططات وبيانات هندسية موثوقة قبل الاعتماد.",
      descriptionEn: "I understand the system's general structure, but final design and quantities require enclosure dimensions, drawings, and trusted engineering inputs before approval.",
      components,
    };
  }

  if (trusted) {
    return {
      recognized: true,
      confidence: "TRUSTED",
      headingAr: "تم التعرف على النظام ومكوناته الرئيسية",
      headingEn: "System and major components understood",
      descriptionAr: "التكوين المعروض مبني على قواعد النظام الموثوقة داخل VOKA، مع بقاء المراجعة البشرية مطلوبة قبل الاعتماد.",
      descriptionEn: "This structure is based on VOKA's governed system rules; human review is still required before approval.",
      components,
    };
  }

  return {
    recognized: true,
    confidence: "PROVISIONAL",
    headingAr: "تم فهم نوع النظام والتكوين العام المتوقع",
    headingEn: "System type and expected structure understood",
    descriptionAr: provisional?.evidence.length
      ? "هذا فهم مدعوم بمصادر فنية، لكن بعض التفاصيل الهندسية تحتاج تأكيد قبل الاعتماد."
      : "هذا فهم مبدئي، وبعض التفاصيل الفنية تحتاج تأكيد قبل الاعتماد.",
    descriptionEn: provisional?.evidence.length
      ? "This understanding is supported by technical sources, but some engineering details still need confirmation before approval."
      : "This is a preliminary understanding; some technical details still need confirmation before approval.",
    components,
  };
}
