import { UniqueEntityID } from './UniqueEntityID';

export abstract class Entity<Props> {
  protected readonly props: Props;
  private readonly entityId: UniqueEntityID;

  protected constructor(props: Props, id?: UniqueEntityID) {
    this.props = props;
    this.entityId = id ?? new UniqueEntityID();
  }

  public get id(): UniqueEntityID {
    return this.entityId;
  }

  public equals(entity?: Entity<Props>): boolean {
    if (!entity) {
      return false;
    }

    if (entity === this) {
      return true;
    }

    return this.entityId.equals(entity.entityId);
  }
}