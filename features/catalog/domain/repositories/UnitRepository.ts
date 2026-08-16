import type { Unit } from '../entities/Unit';

export type UnitListFilters = {
  companyId?: string;
  isActive?: boolean;
};

export interface UnitRepository {
  findById(id: string, companyId: string): Promise<Unit | null>;
  findBySymbol(companyId: string, symbol: string): Promise<Unit | null>;
  findAll(filters?: UnitListFilters): Promise<Unit[]>;
  save(unit: Unit): Promise<Unit>;
}
