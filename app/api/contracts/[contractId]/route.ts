import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { GetContractUseCase } from "@/src/application/contract";
import { PrismaContractRepository } from "@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contractRepository = new PrismaContractRepository(prisma);
const getContractUseCase = new GetContractUseCase(contractRepository);

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const contractId = pathSegments[pathSegments.length - 1];

    if (!contractId || contractId === "contracts") {
      throw ApiError.notFound(
        "CONTRACT_NOT_FOUND",
        "Contract not found.",
      );
    }

    const contract = await getContractUseCase.execute(
      company.companyId,
      contractId,
    );

    if (!contract) {
      throw ApiError.notFound(
        "CONTRACT_NOT_FOUND",
        "Contract not found.",
      );
    }

    return apiSuccess(serializeContract(contract), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

import { serializeContract } from "../serialize-contract";
