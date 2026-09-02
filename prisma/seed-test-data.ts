import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); async function main() { console.log('Skipped.'); } main().finally(() => prisma.$disconnect());
