import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { runPlanReminders } from "../src/lib/plan-reminders";
import { resetDatabase, seedFixture, type Fixture } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("تذكيرات الصيانة الوقائية", () => {
  let fx: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createPlan(dueInDays: number, isActive = true) {
    return prisma.preventivePlan.create({
      data: {
        organizationId: fx.organizationId,
        propertyId: fx.propertyId,
        unitId: fx.unitId,
        assignedTechnicianId: fx.technicianProfileId,
        title: "فحص المصعد",
        category: "أخرى",
        frequencyDays: 30,
        nextDueAt: new Date(Date.now() + dueInDays * DAY_MS),
        isActive,
      },
    });
  }

  it("يُشعر عن الخطط المستحقة خلال ثلاثة أيام", async () => {
    await createPlan(2);
    expect(await runPlanReminders()).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { type: "plan_due" },
    });
    // manager + assigned technician
    expect(notifications).toHaveLength(2);
  });

  it("يتجاهل الخطط البعيدة والموقوفة", async () => {
    await createPlan(30);
    await createPlan(1, false);
    expect(await runPlanReminders()).toBe(0);
  });

  it("لا يكرر التذكير خلال 24 ساعة", async () => {
    await createPlan(-1);
    expect(await runPlanReminders()).toBe(1);
    expect(await runPlanReminders()).toBe(0);
  });
});
