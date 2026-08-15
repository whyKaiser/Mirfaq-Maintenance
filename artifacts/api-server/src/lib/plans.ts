/**
 * Subscription plan catalogue.
 *
 * Prices are stored in halalas (1 SAR = 100 halalas) so all money in the
 * system stays integer, matching the request cost columns.
 *
 * Limits are enforced by src/middleware/plan-limits.ts. A `null` limit means
 * unlimited for that plan.
 */

export type PlanCode = "tajribi" | "bidaya" | "aamal" | "muassasat";

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  monthlyPriceHalalas: number;
  /** null = negotiated per contract, shown as "حسب الاحتياج". */
  isCustomPriced: boolean;
  maxUnits: number | null;
  maxManagers: number | null;
  maxTechnicians: number | null;
  maxProperties: number | null;
  features: string[];
}

export const VAT_RATE = 0.15;

export const PLANS: Record<PlanCode, PlanDefinition> = {
  tajribi: {
    code: "tajribi",
    name: "تجريبي",
    monthlyPriceHalalas: 0,
    isCustomPriced: false,
    maxUnits: 10,
    maxManagers: 1,
    maxTechnicians: 2,
    maxProperties: 1,
    features: ["حتى 10 وحدات", "عقار واحد", "بلاغات وتقارير أساسية"],
  },
  bidaya: {
    code: "bidaya",
    name: "البداية",
    monthlyPriceHalalas: 299_00,
    isCustomPriced: false,
    maxUnits: 50,
    maxManagers: 1,
    maxTechnicians: 5,
    maxProperties: 5,
    features: ["حتى 50 وحدة", "مدير واحد", "بلاغات غير محدودة", "تقارير أساسية"],
  },
  aamal: {
    code: "aamal",
    name: "الأعمال",
    monthlyPriceHalalas: 699_00,
    isCustomPriced: false,
    maxUnits: 250,
    maxManagers: 5,
    maxTechnicians: 25,
    maxProperties: 25,
    features: [
      "حتى 250 وحدة",
      "عدة مدراء",
      "أوامر عمل وتقارير",
      "سجل العمليات وهوية المنشأة",
    ],
  },
  muassasat: {
    code: "muassasat",
    name: "المؤسسات",
    monthlyPriceHalalas: 0,
    isCustomPriced: true,
    maxUnits: null,
    maxManagers: null,
    maxTechnicians: null,
    maxProperties: null,
    features: ["وحدات غير محدودة", "تكاملات حسب الطلب", "اتفاقية مستوى خدمة"],
  },
};

export const PLAN_ORDER: PlanCode[] = [
  "tajribi",
  "bidaya",
  "aamal",
  "muassasat",
];

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && value in PLANS;
}

/** Falls back to the trial plan for unknown/legacy values instead of throwing. */
export function getPlan(code: string): PlanDefinition {
  return isPlanCode(code) ? PLANS[code] : PLANS.tajribi;
}
