import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { computeTotals, monthStart, monthEnd } from "../src/lib/billing";
import { resetDatabase, seedFixture, loginAs, type Fixture } from "./helpers";

describe("الاشتراك والفوترة", () => {
  let fx: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixture("bidaya");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("يعرض الباقة الحالية والاستخدام", async () => {
    const manager = await loginAs(fx.managerEmail);
    const res = await manager.get("/api/subscription");
    expect(res.status).toBe(200);
    expect(res.body.planCode).toBe("bidaya");
    expect(res.body.monthlyPrice).toBe(299);
    expect(res.body.usage.units).toBe(1);
    expect(res.body.limits.units).toBe(50);
  });

  it("يمنع تجاوز حد الوحدات في الباقة التجريبية", async () => {
    await resetDatabase();
    fx = await seedFixture("tajribi");
    const manager = await loginAs(fx.managerEmail);

    // The trial plan allows 10 units; the fixture already created one.
    for (let i = 2; i <= 10; i += 1) {
      const ok = await manager
        .post(`/api/properties/${fx.propertyId}/units`)
        .send({ number: `10${i}`, floor: 1 });
      expect(ok.status).toBe(201);
    }

    const blocked = await manager
      .post(`/api/properties/${fx.propertyId}/units`)
      .send({ number: "999", floor: 9 });
    expect(blocked.status).toBe(402);
    expect(blocked.body.limit).toBe(10);
  });

  it("يرفض التحويل لباقة أصغر من الاستخدام الحالي", async () => {
    const manager = await loginAs(fx.managerEmail);
    for (let i = 2; i <= 12; i += 1) {
      await manager
        .post(`/api/properties/${fx.propertyId}/units`)
        .send({ number: `2${i}`, floor: 2 });
    }

    const res = await manager.patch("/api/subscription").send({ planCode: "tajribi" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("الوحدات");
  });

  it("يقبل الترقية لباقة أكبر", async () => {
    const manager = await loginAs(fx.managerEmail);
    const res = await manager.patch("/api/subscription").send({ planCode: "aamal" });
    expect(res.status).toBe(200);
    expect(res.body.planCode).toBe("aamal");
  });

  it("يرفض رمز باقة غير معروف", async () => {
    const manager = await loginAs(fx.managerEmail);
    const res = await manager.patch("/api/subscription").send({ planCode: "ghost" });
    expect(res.status).toBe(400);
  });

  it("يحسب الاشتراك وتكاليف الصيانة والضريبة", async () => {
    await prisma.maintenanceRequest.create({
      data: {
        title: "بلاغ مكتمل",
        description: "تم الإصلاح",
        category: "سباكة",
        priority: "عادي",
        status: "مكتملة",
        propertyId: fx.propertyId,
        unitId: fx.unitId,
        residentId: fx.residentId,
        organizationId: fx.organizationId,
        laborCostHalalas: 200_00,
        partsCostHalalas: 100_00,
      },
    });

    const now = new Date();
    const totals = await computeTotals(
      fx.organizationId,
      monthStart(now),
      monthEnd(now),
    );

    expect(totals.subscriptionHalalas).toBe(299_00);
    expect(totals.maintenanceHalalas).toBe(300_00);
    // 15% VAT on 599.00 SAR
    expect(totals.vatHalalas).toBe(Math.round(599_00 * 0.15));
    expect(totals.totalHalalas).toBe(599_00 + totals.vatHalalas);
    expect(totals.requestsCount).toBe(1);
  });

  it("ينشئ فاتورة الشهر مرة واحدة ويحدّث حالتها", async () => {
    const manager = await loginAs(fx.managerEmail);

    const first = await manager.post("/api/invoices").send({});
    expect(first.status).toBe(201);
    const second = await manager.post("/api/invoices").send({});
    expect(second.body.id).toBe(first.body.id);

    const list = await manager.get("/api/invoices");
    expect(list.body).toHaveLength(1);

    const issued = await manager
      .patch(`/api/invoices/${first.body.id}`)
      .send({ status: "صادرة" });
    expect(issued.status).toBe(200);
    expect(issued.body.issuedAt).not.toBeNull();

    const bad = await manager
      .patch(`/api/invoices/${first.body.id}`)
      .send({ status: "ملغاة" });
    expect(bad.status).toBe(400);
  });

  it("يمنع الساكن من الوصول لبيانات الفوترة", async () => {
    const resident = await loginAs(fx.residentEmail);
    expect((await resident.get("/api/subscription")).status).toBe(403);
    expect((await resident.get("/api/invoices")).status).toBe(403);
  });

  it("لا يعرض فواتير مؤسسة أخرى", async () => {
    const other = await seedFixture("aamal", "b");
    await prisma.invoice.create({
      data: {
        organizationId: other.organizationId,
        periodStart: monthStart(new Date()),
        periodEnd: monthEnd(new Date()),
        planCode: "aamal",
      },
    });

    const manager = await loginAs(fx.managerEmail);
    const list = await manager.get("/api/invoices");
    expect(list.body).toHaveLength(0);
  });
});
