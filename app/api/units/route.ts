import {
  PrismaUnitRepository,
  Unit,
} from '../../../features/catalog';
import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from '../../../lib/api';
import { prisma } from '../../../lib/prisma';

const unitRepository = new PrismaUnitRepository(prisma);

function serializeUnit(unit: Unit) {
  return {
    id: unit.id.toString(),
    companyId: unit.companyId,
    name: unit.name,
    nameAr: unit.nameAr,
    nameEn: unit.nameEn,
    symbol: unit.symbol,
    isActive: unit.isActive,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (_request, _auth, company) => {
    const units = await unitRepository.findAll({
      companyId: company.companyId,
      isActive: true,
    });

    return apiSuccess(units.map(serializeUnit), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);

export const POST = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES'],
  async (request, _auth, company) => {
    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === 'string' ? body.name : '';
    const symbol = typeof body.symbol === 'string' ? body.symbol : '';
    const nameAr = typeof body.nameAr === 'string' ? body.nameAr : null;
    const nameEn = typeof body.nameEn === 'string' ? body.nameEn : null;

    if (!name.trim() || !symbol.trim()) {
      throw ApiError.badRequest(
        'INVALID_REQUEST_BODY',
        'name and symbol are required for Unit creation.',
      );
    }

    const existingBySymbol = await unitRepository.findBySymbol(
      company.companyId,
      symbol.trim(),
    );
    if (existingBySymbol) {
      throw ApiError.conflict(
        'UNIT_SYMBOL_ALREADY_EXISTS',
        'A unit with this symbol already exists for this company.',
      );
    }

    const unitResult = Unit.create({
      companyId: company.companyId,
      name,
      symbol,
      nameAr,
      nameEn,
      isActive: true,
    });

    if (!unitResult.isSuccess) {
      const error = unitResult.getError();
      throw ApiError.badRequest(error.code, error.message);
    }

    const saved = await unitRepository.save(unitResult.getValue());

    return apiSuccess(serializeUnit(saved), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
