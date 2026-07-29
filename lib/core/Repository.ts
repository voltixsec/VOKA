export interface Repository<Entity, Identifier = string> {
  findById(id: Identifier): Promise<Entity | null>;

  save(entity: Entity): Promise<Entity>;

  delete(id: Identifier): Promise<void>;
}