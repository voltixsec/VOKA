export class UniqueEntityID {
  private readonly value: string;

  constructor(value?: string) {
    this.value = value?.trim() || crypto.randomUUID();
  }

  public equals(id?: UniqueEntityID): boolean {
    if (!id) {
      return false;
    }

    return this.value === id.value;
  }

  public toString(): string {
    return this.value;
  }

  public toValue(): string {
    return this.value;
  }
}