/**
 * Shared test fixtures: a clean organization with a manager, a resident, a
 * technician, one property and one unit, plus a logged-in supertest agent.
 */
import bcrypt from "bcryptjs";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";

export const PASSWORD = "TestPass123!";

export interface Fixture {
  organizationId: string;
  managerId: string;
  residentId: string;
  technicianUserId: string;
  technicianProfileId: string;
  propertyId: string;
  unitId: string;
  managerEmail: string;
  residentEmail: string;
  technicianEmail: string;
}

/** Wipes every table so each test file starts from a known state. */
export async function resetDatabase(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.requestAttachment.deleteMany();
  await prisma.requestComment.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.preventivePlan.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.technicianProfile.deleteMany();
  await prisma.salesLead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

export async function seedFixture(
  planCode: string = "aamal",
  suffix = "a",
): Promise<Fixture> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const org = await prisma.organization.create({
    data: { name: `منشأة اختبار ${suffix}`, planCode },
  });

  const managerEmail = `manager-${suffix}@test.sa`;
  const residentEmail = `resident-${suffix}@test.sa`;
  const technicianEmail = `tech-${suffix}@test.sa`;

  const manager = await prisma.user.create({
    data: {
      name: "مدير الاختبار",
      email: managerEmail,
      passwordHash,
      role: "manager",
      organizationId: org.id,
    },
  });
  const resident = await prisma.user.create({
    data: {
      name: "ساكن الاختبار",
      email: residentEmail,
      passwordHash,
      role: "resident",
      organizationId: org.id,
    },
  });
  const technician = await prisma.user.create({
    data: {
      name: "فني الاختبار",
      email: technicianEmail,
      passwordHash,
      role: "technician",
      organizationId: org.id,
    },
  });
  const technicianProfile = await prisma.technicianProfile.create({
    data: { userId: technician.id, specialty: "كهرباء" },
  });

  const property = await prisma.property.create({
    data: {
      name: "برج الاختبار",
      address: "الرياض",
      managerId: manager.id,
      organizationId: org.id,
    },
  });
  const unit = await prisma.unit.create({
    data: { number: "101", floor: 1, propertyId: property.id, residentId: resident.id },
  });

  return {
    organizationId: org.id,
    managerId: manager.id,
    residentId: resident.id,
    technicianUserId: technician.id,
    technicianProfileId: technicianProfile.id,
    propertyId: property.id,
    unitId: unit.id,
    managerEmail,
    residentEmail,
    technicianEmail,
  };
}

/** Returns a supertest agent that carries the session cookie for `email`. */
export async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ email, password: PASSWORD });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  }
  return agent;
}
