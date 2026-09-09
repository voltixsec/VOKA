import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { GetContractUseCase } from '@/src/application/contract';
import { PrismaContractRepository } from '@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository';
import { serializeContract } from '@/app/api/contracts/serialize-contract';
import { COMPANY_IDENTITY_SELECT } from './company-document-identity';

const getContract = new GetContractUseCase(new PrismaContractRepository(prisma));

export function contractIdFromDocumentRequest(request: Request, format: 'pdf' | 'xlsx') {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const index = parts.indexOf(format);
  if (index < 1) throw ApiError.badRequest('CONTRACT_ID_REQUIRED', 'contractId is required.');
  return decodeURIComponent(parts[index - 1]);
}

export async function getContractDocumentSnapshot(companyId: string, contractId: string) {
  const contract = await getContract.execute(companyId, contractId);
  if (!contract) throw ApiError.notFound('CONTRACT_NOT_FOUND', 'Contract not found.');
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: COMPANY_IDENTITY_SELECT,
  });
  if (!company) throw ApiError.notFound('COMPANY_NOT_FOUND', 'Company not found.');
  return {
    ...serializeContract(contract),
    companyIdentity: company,
  };
}
