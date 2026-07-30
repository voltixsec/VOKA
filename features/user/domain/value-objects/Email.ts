import {
  DomainError,
  Guard,
  Result,
  ValueObject,
} from '../../../../lib/core';

type EmailProps = {
  value: string;
};

export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static create(
    email: string,
  ): Result<Email, DomainError> {
    const normalizedEmail = email.trim().toLowerCase();

    const emptyGuard = Guard.againstEmptyString(
      normalizedEmail,
      'Email',
    );

    if (!emptyGuard.succeeded) {
      return Result.failure(
        new DomainError(
          emptyGuard.message ?? 'Email is required.',
          'INVALID_EMAIL',
        ),
      );
    }

    const emailGuard = Guard.againstInvalidEmail(
      normalizedEmail,
      'Email',
    );

    if (!emailGuard.succeeded) {
      return Result.failure(
        new DomainError(
          emailGuard.message ?? 'Email is invalid.',
          'INVALID_EMAIL',
        ),
      );
    }

    return Result.success(
      new Email({
        value: normalizedEmail,
      }),
    );
  }
}
