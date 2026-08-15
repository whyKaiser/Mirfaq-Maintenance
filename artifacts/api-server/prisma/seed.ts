import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding مِرفق database (Phase 3)...");

  const passwordHash = await bcrypt.hash("Demo123!", 12);

  // ──────────────────────────────────────────────
  // Demo Organization
  // ──────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: "org-demo" },
    update: {},
    create: {
      id: "org-demo",
      name: "شركة مِرفق لإدارة العقارات",
      crNumber: "1010123456",
      phone: "+966112345678",
      city: "الرياض",
      brandColor: "#0891b2",
      // الباقة التجريبية تسمح بعقار واحد فقط، والبيانات التجريبية فيها عقاران.
      planCode: "aamal",
    },
  });

  // ──────────────────────────────────────────────
  // Users
  // ──────────────────────────────────────────────
  const manager = await prisma.user.upsert({
    where: { email: "manager@mirfaq.sa" },
    update: {},
    create: {
      name: "أحمد العمري",
      email: "manager@mirfaq.sa",
      phone: "+966501112222",
      passwordHash,
      role: "manager",
      isActive: true,
      organizationId: org.id,
    },
  });

  const resident = await prisma.user.upsert({
    where: { email: "resident@mirfaq.sa" },
    update: {},
    create: {
      name: "سارة الزهراني",
      email: "resident@mirfaq.sa",
      phone: "+966503334444",
      passwordHash,
      role: "resident",
      isActive: true,
      organizationId: org.id,
    },
  });

  const techUser = await prisma.user.upsert({
    where: { email: "technician@mirfaq.sa" },
    update: {},
    create: {
      name: "محمد الغامدي",
      email: "technician@mirfaq.sa",
      phone: "+966501234567",
      passwordHash,
      role: "technician",
      isActive: true,
      organizationId: org.id,
    },
  });

  const resident2 = await prisma.user.upsert({
    where: { email: "faisal@mirfaq.sa" },
    update: {},
    create: {
      name: "فيصل الحربي",
      email: "faisal@mirfaq.sa",
      phone: "+966505556666",
      passwordHash,
      role: "resident",
      isActive: true,
      organizationId: org.id,
    },
  });

  const resident3 = await prisma.user.upsert({
    where: { email: "nora@mirfaq.sa" },
    update: {},
    create: {
      name: "نورة المالكي",
      email: "nora@mirfaq.sa",
      phone: "+966507778888",
      passwordHash,
      role: "resident",
      isActive: true,
      organizationId: org.id,
    },
  });

  const techUser2 = await prisma.user.upsert({
    where: { email: "khalid@mirfaq.sa" },
    update: {},
    create: {
      name: "خالد القحطاني",
      email: "khalid@mirfaq.sa",
      phone: "+966507654321",
      passwordHash,
      role: "technician",
      isActive: true,
      organizationId: org.id,
    },
  });

  const techUser3 = await prisma.user.upsert({
    where: { email: "sultan@mirfaq.sa" },
    update: {},
    create: {
      name: "سلطان المطيري",
      email: "sultan@mirfaq.sa",
      phone: "+966509871234",
      passwordHash,
      role: "technician",
      isActive: true,
      organizationId: org.id,
    },
  });

  // ──────────────────────────────────────────────
  // Technician profiles
  // ──────────────────────────────────────────────
  const techProfile = await prisma.technicianProfile.upsert({
    where: { userId: techUser.id },
    update: {},
    create: { userId: techUser.id, specialty: "سباكة", phone: "+966501234567" },
  });

  const techProfile2 = await prisma.technicianProfile.upsert({
    where: { userId: techUser2.id },
    update: {},
    create: { userId: techUser2.id, specialty: "كهرباء", phone: "+966507654321" },
  });

  await prisma.technicianProfile.upsert({
    where: { userId: techUser3.id },
    update: {},
    create: { userId: techUser3.id, specialty: "تكييف", phone: "+966509871234" },
  });

  // ──────────────────────────────────────────────
  // Properties
  // ──────────────────────────────────────────────
  const property1 = await prisma.property.upsert({
    where: { id: "prop-yasmin" },
    update: {},
    create: {
      id: "prop-yasmin",
      name: "مجمع الياسمين السكني",
      address: "حي الياسمين، طريق الملك عبدالعزيز، الرياض",
      managerId: manager.id,
      organizationId: org.id,
    },
  });

  const property2 = await prisma.property.upsert({
    where: { id: "prop-nakheel" },
    update: {},
    create: {
      id: "prop-nakheel",
      name: "برج النخيل التجاري",
      address: "طريق الملك فهد، حي العليا، الرياض",
      managerId: manager.id,
      organizationId: org.id,
    },
  });

  // ──────────────────────────────────────────────
  // Units
  // ──────────────────────────────────────────────
  const unit3B = await prisma.unit.upsert({
    where: { id: "unit-3b" },
    update: {},
    create: { id: "unit-3b", number: "3B", floor: 3, propertyId: property1.id, residentId: resident.id },
  });

  const unitVilla12 = await prisma.unit.upsert({
    where: { id: "unit-villa12" },
    update: {},
    create: { id: "unit-villa12", number: "فيلا 12", floor: 1, propertyId: property1.id, residentId: resident2.id },
  });

  const unit7A = await prisma.unit.upsert({
    where: { id: "unit-7a" },
    update: {},
    create: { id: "unit-7a", number: "7A", floor: 7, propertyId: property1.id, residentId: resident3.id },
  });

  await prisma.unit.upsert({
    where: { id: "unit-studio9" },
    update: {},
    create: { id: "unit-studio9", number: "استوديو 9", floor: 9, propertyId: property2.id, residentId: null },
  });

  await prisma.unit.upsert({
    where: { id: "unit-2c" },
    update: {},
    create: { id: "unit-2c", number: "2C", floor: 2, propertyId: property2.id, residentId: null },
  });

  // ──────────────────────────────────────────────
  // Maintenance requests
  // ──────────────────────────────────────────────
  const req1 = await prisma.maintenanceRequest.upsert({
    where: { id: "req-001" },
    update: {},
    create: {
      id: "req-001",
      title: "تسرب مياه في الحمام الرئيسي",
      description: "يوجد تسرب مستمر من صنبور الحمام الرئيسي، الأرضية مبللة باستمرار مما يشكل خطراً",
      category: "سباكة",
      priority: "عاجل",
      status: "قيد التنفيذ",
      propertyId: property1.id,
      unitId: unit3B.id,
      residentId: resident.id,
      technicianId: techProfile.id,
      organizationId: org.id,
    },
  });

  const req2 = await prisma.maintenanceRequest.upsert({
    where: { id: "req-002" },
    update: {},
    create: {
      id: "req-002",
      title: "عطل كهربائي في المطبخ",
      description: "انقطع التيار الكهربائي عن المطبخ فجأة، لا يعمل أي مقبس",
      category: "كهرباء",
      priority: "عادي",
      status: "مكتملة",
      propertyId: property1.id,
      unitId: unit3B.id,
      residentId: resident.id,
      technicianId: techProfile2.id,
      organizationId: org.id,
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: "req-003" },
    update: {},
    create: {
      id: "req-003",
      title: "باب غرفة النوم لا يغلق",
      description: "باب غرفة النوم الرئيسية لا يغلق بالكامل ويحتاج إصلاح الإطار",
      category: "أخرى",
      priority: "عادي",
      status: "معلّقة",
      propertyId: property1.id,
      unitId: unit3B.id,
      residentId: resident.id,
      technicianId: null,
      organizationId: org.id,
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: "req-004" },
    update: {},
    create: {
      id: "req-004",
      title: "تكييف الصالة لا يعمل",
      description: "جهاز التكييف في الصالة توقف ويصدر صوتاً عند تشغيله ثم يتوقف",
      category: "تكييف",
      priority: "عاجل",
      status: "معلّقة",
      propertyId: property1.id,
      unitId: unit7A.id,
      residentId: resident3.id,
      technicianId: null,
      organizationId: org.id,
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: "req-005" },
    update: {},
    create: {
      id: "req-005",
      title: "انخفاض ضغط المياه",
      description: "ضغط المياه منخفض جداً في جميع صنابير الوحدة، يصعب الاستخدام",
      category: "سباكة",
      priority: "عادي",
      status: "قيد التنفيذ",
      propertyId: property1.id,
      unitId: unitVilla12.id,
      residentId: resident2.id,
      technicianId: techProfile.id,
      organizationId: org.id,
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: "req-006" },
    update: {},
    create: {
      id: "req-006",
      title: "عطل في نظام الإنارة",
      description: "نصف أضواء الممرات لا تعمل منذ أسبوع",
      category: "كهرباء",
      priority: "عادي",
      status: "مكتملة",
      propertyId: property2.id,
      unitId: "unit-studio9",
      residentId: resident2.id,
      technicianId: techProfile2.id,
      organizationId: org.id,
    },
  });

  await prisma.preventivePlan.upsert({
    where: { id: "plan-ac-yasmin" },
    update: {},
    create: {
      id: "plan-ac-yasmin",
      organizationId: org.id,
      propertyId: property1.id,
      unitId: unit3B.id,
      assignedTechnicianId: techProfile.id,
      title: "صيانة دورية لمكيف الوحدة",
      category: "تكييف",
      frequencyDays: 90,
      nextDueAt: new Date("2026-08-01T06:00:00.000Z"),
      notes: "تنظيف الفلاتر وفحص غاز التبريد",
    },
  });

  // ──────────────────────────────────────────────
  // Comments
  // ──────────────────────────────────────────────
  await prisma.requestComment.upsert({
    where: { id: "cmt-001" },
    update: {},
    create: {
      id: "cmt-001",
      content: "تم الوصول للوحدة وتشخيص المشكلة. التسرب من وصلة الصنبور الداخلية. سنبدأ الإصلاح غداً صباحاً.",
      requestId: req1.id,
      authorId: techUser.id,
    },
  });

  await prisma.requestComment.upsert({
    where: { id: "cmt-002" },
    update: {},
    create: {
      id: "cmt-002",
      content: "شكراً على الاستجابة السريعة. الرجاء التواصل قبل الحضور.",
      requestId: req1.id,
      authorId: resident.id,
    },
  });

  await prisma.requestComment.upsert({
    where: { id: "cmt-003" },
    update: {},
    create: {
      id: "cmt-003",
      content: "تم الإصلاح بنجاح. تم تبديل وصلة الأسلاك المعطوبة وإعادة التوصيل.",
      requestId: req2.id,
      authorId: techUser2.id,
    },
  });

  await prisma.requestComment.upsert({
    where: { id: "cmt-004" },
    update: {},
    create: {
      id: "cmt-004",
      content: "ممتاز، شكراً لسرعة الاستجابة.",
      requestId: req2.id,
      authorId: resident.id,
    },
  });

  // ──────────────────────────────────────────────
  // Seed audit log entries
  // ──────────────────────────────────────────────
  await prisma.auditLog.upsert({
    where: { id: "audit-001" },
    update: {},
    create: {
      id: "audit-001",
      organizationId: org.id,
      actorId: manager.id,
      actorName: manager.name,
      action: "create_property",
      entityType: "property",
      entityId: property1.id,
      entityLabel: property1.name,
    },
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-002" },
    update: {},
    create: {
      id: "audit-002",
      organizationId: org.id,
      actorId: resident.id,
      actorName: resident.name,
      action: "create_request",
      entityType: "request",
      entityId: req1.id,
      entityLabel: req1.title,
    },
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-003" },
    update: {},
    create: {
      id: "audit-003",
      organizationId: org.id,
      actorId: manager.id,
      actorName: manager.name,
      action: "assign_technician",
      entityType: "request",
      entityId: req1.id,
      entityLabel: req1.title,
    },
  });

  console.log("✅ Seeding complete!\n");
  console.log("Demo accounts (password: Demo123!):");
  console.log("  مدير العقار  : manager@mirfaq.sa");
  console.log("  الساكن       : resident@mirfaq.sa");
  console.log("  الفني        : technician@mirfaq.sa");
  console.log(`\n  Organization : ${org.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
