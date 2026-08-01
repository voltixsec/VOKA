import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123", 12);

  const company = await prisma.company.upsert({
    where: {
      slug: "voka-demo",
    },
    update: {},
    create: {
      name: "VOKA Demo Company",
      slug: "voka-demo",
      defaultCurrency: "KWD",
      timezone: "Asia/Kuwait",
    },
  });

  const user = await prisma.user.upsert({
    where: {
      email: "admin@voka.local",
    },
    update: {},
    create: {
      email: "admin@voka.local",
      name: "System Administrator",
      passwordHash,
    },
  });

  await prisma.companyMember.upsert({
    where: {
      companyId_userId: {
        companyId: company.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      companyId: company.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.unit.upsert({
    where: { symbol: "PCS" },
    update: {},
    create: {
      name: "Piece",
      symbol: "PCS",
    },
  });

  await prisma.unit.upsert({
    where: { symbol: "KG" },
    update: {},
    create: {
      name: "Kilogram",
      symbol: "KG",
    },
  });

  await prisma.unit.upsert({
    where: { symbol: "TON" },
    update: {},
    create: {
      name: "Ton",
      symbol: "TON",
    },
  });

  await prisma.taxRate.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "VAT 0%",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: "VAT 0%",
      percentage: 0,
      isSystem: true,
    },
  });

  await prisma.priceList.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "DEFAULT",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      code: "DEFAULT",
      name: "Default Price List",
      currencyCode: "KWD",
      isDefault: true,
    },
  });

  console.log("");
  console.log("====================================");
  console.log("VOKA Bootstrap Seed Completed");
  console.log("Company :", company.name);
  console.log("User    : admin@voka.local");
  console.log("Password: Admin@123");
  console.log("====================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
