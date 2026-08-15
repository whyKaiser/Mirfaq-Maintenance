import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { resetDatabase, seedFixture, loginAs, type Fixture } from "./helpers";

describe("الإشعارات", () => {
  let fx: Fixture;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ينشئ إشعارًا للمدير عند إنشاء الساكن بلاغًا", async () => {
    const resident = await loginAs(fx.residentEmail);
    const created = await resident.post("/api/requests").send({
      title: "تسريب مياه",
      description: "تسريب في المطبخ",
      category: "سباكة",
      priority: "عاجل",
      unitId: fx.unitId,
    });
    expect(created.status).toBe(201);

    const manager = await loginAs(fx.managerEmail);
    const list = await manager.get("/api/notifications");
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBe(1);
    expect(list.body.items[0].type).toBe("request_created");
    expect(list.body.items[0].entityId).toBe(created.body.id);
  });

  it("لا يُشعر الفاعل بنفسه", async () => {
    const resident = await loginAs(fx.residentEmail);
    await resident.post("/api/requests").send({
      title: "عطل مكيف",
      description: "المكيف لا يبرد",
      category: "تكييف",
      priority: "عادي",
      unitId: fx.unitId,
    });

    const list = await resident.get("/api/notifications");
    expect(list.body.unreadCount).toBe(0);
  });

  it("يُشعر الساكن والفني عند تغيير حالة البلاغ", async () => {
    const resident = await loginAs(fx.residentEmail);
    const created = await resident.post("/api/requests").send({
      title: "كهرباء",
      description: "انقطاع في الإنارة",
      category: "كهرباء",
      priority: "عادي",
      unitId: fx.unitId,
    });

    const manager = await loginAs(fx.managerEmail);
    const patched = await manager
      .patch(`/api/requests/${created.body.id}`)
      .send({ status: "قيد التنفيذ", technicianId: fx.technicianProfileId });
    expect(patched.status).toBe(200);

    const residentList = await resident.get("/api/notifications");
    const types = residentList.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain("request_status_changed");
    expect(types).toContain("request_assigned");

    const technician = await loginAs(fx.technicianEmail);
    const techList = await technician.get("/api/notifications");
    expect(techList.body.unreadCount).toBeGreaterThan(0);
  });

  it("يعلّم الإشعارات كمقروءة", async () => {
    const resident = await loginAs(fx.residentEmail);
    await resident.post("/api/requests").send({
      title: "باب",
      description: "الباب لا يغلق جيدًا",
      category: "أخرى",
      priority: "عادي",
      unitId: fx.unitId,
    });

    const manager = await loginAs(fx.managerEmail);
    const before = await manager.get("/api/notifications");
    expect(before.body.unreadCount).toBe(1);

    const readAll = await manager.post("/api/notifications/read-all");
    expect(readAll.status).toBe(200);

    const after = await manager.get("/api/notifications");
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.items[0].isRead).toBe(true);
  });

  it("يمنع الوصول لإشعارات مؤسسة أخرى", async () => {
    const other = await seedFixture("aamal", "b");
    await prisma.notification.create({
      data: {
        organizationId: other.organizationId,
        userId: other.managerId,
        type: "request_created",
        title: "بلاغ في منشأة أخرى",
        body: "لا يجب أن يظهر",
      },
    });

    const manager = await loginAs(fx.managerEmail);
    const list = await manager.get("/api/notifications");
    expect(list.body.items).toHaveLength(0);
  });

  it("يحدّث تفضيلات الإشعارات", async () => {
    const manager = await loginAs(fx.managerEmail);
    const res = await manager
      .patch("/api/notification-preferences")
      .send({ notifyInApp: false, notifyEmail: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notifyInApp: false, notifyEmail: true });

    const bad = await manager
      .patch("/api/notification-preferences")
      .send({ notifyInApp: "نعم" });
    expect(bad.status).toBe(400);
  });
});
