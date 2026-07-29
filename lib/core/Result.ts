export class Result<T, E = Error> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly value?: T,
    private readonly error?: E,
  ) {}

  public static success<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  public static failure<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public getValue(): T {
    if (!this.isSuccess || this.value === undefined) {
      throw new Error('Cannot get the value of a failed result.');
    }

    return this.value;
  }

  public getError(): E {
    if (this.isSuccess || this.error === undefined) {
      throw new Error('Cannot get the error of a successful result.');
    }

    return this.error;
  }
}