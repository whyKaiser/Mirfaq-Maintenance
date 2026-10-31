/** Deterministic, deliberately conservative advice; this is not an AI agent. */
export type Advice = {
  state: "escalate" | "clarify" | "review";
  priority: "urgent" | "undetermined";
  specialty: "hvac" | "electrical" | "plumbing" | "unknown";
  reasons: string[];
  nextSteps: string[];
};

export function maintenanceAdvice(title: string, description: string): Advice {
  const text = `${title} ${description}`.normalize("NFKC").toLowerCase();
  // Only a complete, unambiguous standalone denial of a generic electrical
  // hazard is excluded from the keyword screen. This is not proof of safety:
  // execution still requires the server's explicit risk and policy checks.
  // Other electrical mentions, questions, and contradictory indicators remain.
  const uncertain = /[?؟]|\b(?:maybe|perhaps|possibly|not sure|uncertain|might|could)\b|ربما|محتمل|قد يكون|غير متأكد|لا أعرف/.test(text);
  const screened = uncertain ? text : text.split(/([.!?؟،,;؛\n]+)/).map(part => /^(?:\s*(?:لا يوجد خطر كهربائي|لا يوجد خطر كهرباء|no electrical hazard|there is no electrical hazard)\s*)$/.test(part) ? ' ' : part).join('');
  const water = /تسرب|تسريب|مياه|ماء|موية|يقطر|تقطير|\bleak(?:ing|s)?\b|\bwater\b|\bdripp?ing\b/.test(text);
  const electricity = /كهرب|لوحة|فيش|مقبس|سلك|أسلاك|اسلاك|\belectric(?:al|ity)?\b|\b(?:electrical )?panel\b|\boutlet\b|\bsockets?\b|\bwires?\b/.test(screened);
  const hvac = /مكيف|تكييف|المكيف|التكييف|\b(?:air conditioner|air conditioning|a\/?c|hvac)\b/.test(text);
  const risk = /حريق|دخان|شرر|ماس كهرب|صعق|رائحة غاز|تسرب غاز|\b(?:fire|smoke|sparks?|electrocution|live wires?|exposed wires?|burning smell|smell of (?:gas|burning)|gas leak)\b/.test(text) || /خطر كهرب|\belectrical hazard\b/.test(screened) || (water && electricity);
  let specialty: Advice["specialty"] = "unknown";
  if (hvac) specialty = "hvac";
  else if (electricity && !water) specialty = "electrical";
  else if (water && !electricity) specialty = "plumbing";

  if (risk) return {
    state: "escalate", priority: "urgent", specialty,
    reasons: ["يتضمن الوصف مؤشر خطر محتمل يحتاج تقييمًا بشريًا عاجلًا."],
    nextSteps: ["أحِل البلاغ إلى المسؤول فورًا واتبع إجراءات السلامة المعتمدة لدى الجهة.", "لا تُنفّذ أو تُسند تلقائيًا قبل مراجعة الخطر."],
  };
  if (!title.trim() || description.trim().length < 12 || specialty === "unknown") return {
    state: "clarify", priority: "undetermined", specialty,
    reasons: ["الوصف لا يكفي لتحديد المشكلة والتخصص بأمان."],
    nextSteps: ["اطلب وصف العطل وموقعه والأصل المتأثر وأثره وأي خطر محتمل."],
  };
  return {
    state: "review", priority: "undetermined", specialty,
    reasons: ["اقتراح مبني على كلمات في الوصف وليس تشخيصًا أو تقييمًا مكتملًا للمخاطر."],
    nextSteps: ["تحقق من الأصل والموقع والأثر والخطر والتكرار وتوفر الفني قبل الإسناد.", "الأولوية غير محددة حتى تُراجع سياسة الجهة والأثر."],
  };
}

/** Evidence is evaluated as explicit facts supplied by a reviewer, never inferred from prose. */
export function closureAdvice(input: { actionDescribed: boolean; issueResolved: boolean; evidenceAttached: boolean; contradiction: boolean }) {
  const missing: string[] = [];
  if (!input.actionDescribed) missing.push("وصف الإجراء المنفذ");
  if (!input.issueResolved) missing.push("تأكيد معالجة المشكلة الأصلية");
  if (!input.evidenceAttached) missing.push("الدليل المطلوب");
  if (input.contradiction) missing.push("توضيح التناقض في التقرير");
  return { state: missing.length ? "incomplete" : "manager_review", missing, closesAutomatically: false } as const;
}

/** Preliminary screening only. An attachment and phrases are not proof of repair. */
export function screenClosureReport(report: string | null, completionAttachmentCount: number) {
  const text = (report ?? '').normalize('NFKC');
  const visitedOnly = /تمت الزيارة|تمت المعاينة|تمت زياره/.test(text);
  const actionDescribed = /استبدل|استبدال|أصلح|اصلاح|إصلاح|تنظيف|نظف|إعادة تركيب|اعادة تركيب/.test(text);
  const issueResolved = /تم الإصلاح|تم الاصلاح|تم حل|توقف التسرب|يعمل الآن|يعمل الان/.test(text);
  const contradiction = issueResolved && /لم يتم|لم يحل|لا يزال|ما زال|مستمر|لم يعمل/.test(text);
  const result = closureAdvice({ actionDescribed, issueResolved, evidenceAttached: completionAttachmentCount > 0, contradiction });
  return { ...result, reportPresent: Boolean(report), completionAttachmentCount, visitedOnly, proofOfRepair: false, caution: 'الفحص آلي محدود، ولا يثبت الإصلاح الميداني أو توافق الدليل مع البلاغ. مراجعة المسؤول لازمة.' };
}
