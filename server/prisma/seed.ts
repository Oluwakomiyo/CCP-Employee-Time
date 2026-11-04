import { PrismaClient, Role, EmploymentStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.payrollRecord.deleteMany();
  await prisma.timeCorrectionRequest.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.break.deleteMany();
  await prisma.workSegment.deleteMany();
  await prisma.workDay.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.compensation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();

  const saltRounds = 10;

  // 2. Create CEO / Admin
  const adminPassword = await bcrypt.hash('Admin123!', saltRounds);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@company.com',
      passwordHash: adminPassword,
      role: Role.CEO_ADMIN,
      employee: {
        create: {
          employeeCode: 'EMP-001',
          firstName: 'Eleanor',
          lastName: 'Vance',
          department: 'Executive',
          position: 'Chief Executive Officer',
          status: EmploymentStatus.ACTIVE,
          hireDate: new Date('2020-01-15'),
          compensation: {
            create: {
              baseHourlyRate: new Prisma.Decimal(120.0),
              overtimeHourlyRate: new Prisma.Decimal(180.0),
              currency: 'USD',
              effectiveDate: new Date('2020-01-15'),
            },
          },
        },
      },
    },
    include: { employee: true },
  });

  // 3. Create Project Manager
  const pmPassword = await bcrypt.hash('Manager123!', saltRounds);
  const pmUser = await prisma.user.create({
    data: {
      email: 'pm@company.com',
      passwordHash: pmPassword,
      role: Role.PROJECT_MANAGER,
      employee: {
        create: {
          employeeCode: 'EMP-002',
          firstName: 'Marcus',
          lastName: 'Brody',
          department: 'Engineering',
          position: 'Lead Project Manager',
          status: EmploymentStatus.ACTIVE,
          hireDate: new Date('2021-03-01'),
          compensation: {
            create: {
              baseHourlyRate: new Prisma.Decimal(65.0),
              overtimeHourlyRate: new Prisma.Decimal(97.5),
              currency: 'USD',
              effectiveDate: new Date('2021-03-01'),
            },
          },
        },
      },
    },
    include: { employee: true },
  });

  // 4. Create Standard Employee
  const empPassword = await bcrypt.hash('Employee123!', saltRounds);
  const empUser = await prisma.user.create({
    data: {
      email: 'employee@company.com',
      passwordHash: empPassword,
      role: Role.EMPLOYEE,
      employee: {
        create: {
          employeeCode: 'EMP-003',
          firstName: 'Sarah',
          lastName: 'Connor',
          department: 'Engineering',
          position: 'Full Stack Engineer',
          status: EmploymentStatus.ACTIVE,
          hireDate: new Date('2022-06-15'),
          compensation: {
            create: {
              baseHourlyRate: new Prisma.Decimal(45.0),
              overtimeHourlyRate: new Prisma.Decimal(67.5),
              currency: 'USD',
              effectiveDate: new Date('2022-06-15'),
            },
          },
        },
      },
    },
    include: { employee: true },
  });

  // 5. Seed Initial Projects
  const internalPlatform = await prisma.project.create({
    data: {
      code: 'PRJ-CORE',
      name: 'Internal Operations Platform',
      description: 'Core company time tracking and resource planning engine.',
      isActive: true,
      startDate: new Date('2024-01-01'),
    },
  });

  const clientPortal = await prisma.project.create({
    data: {
      code: 'PRJ-PORTAL',
      name: 'Client Self-Service Portal',
      description: 'Customer facing billing and analytics dashboard.',
      isActive: true,
      startDate: new Date('2024-03-01'),
    },
  });

  // 6. Assign Project Memberships
  if (pmUser.employee && empUser.employee) {
    await prisma.projectMember.createMany({
      data: [
        {
          projectId: internalPlatform.id,
          employeeId: pmUser.employee.id,
          isProjectLead: true,
        },
        {
          projectId: internalPlatform.id,
          employeeId: empUser.employee.id,
          isProjectLead: false,
        },
        {
          projectId: clientPortal.id,
          employeeId: pmUser.employee.id,
          isProjectLead: true,
        },
      ],
    });
  }

  console.log('✅ Seeding complete!');
  console.log('--------------------------------------------------');
  console.log(`CEO/Admin:       ${adminUser.email} / Admin123!`);
  console.log(`Project Manager: ${pmUser.email} / Manager123!`);
  console.log(`Employee:        ${empUser.email} / Employee123!`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });