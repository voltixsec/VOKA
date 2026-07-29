type ValueObjectProps = Record<string, unknown>;

export abstract class ValueObject<Props extends ValueObjectProps> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  public equals(valueObject?: ValueObject<Props>): boolean {
    if (!valueObject) {
      return false;
    }

    return JSON.stringify(this.props) === JSON.stringify(valueObject.props);
  }
}