export type GuardResult = {
  succeeded: boolean;
  message?: string;
};

export class Guard {
  public static againstNullOrUndefined(
    value: unknown,
    argumentName: string,
  ): GuardResult {
    if (value === null || value === undefined) {
      return {
        succeeded: false,
        message: `${argumentName} is required.`,
      };
    }

    return { succeeded: true };
  }

  public static againstEmptyString(
    value: string,
    argumentName: string,
  ): GuardResult {
    if (!value.trim()) {
      return {
        succeeded: false,
        message: `${argumentName} cannot be empty.`,
      };
    }

    return { succeeded: true };
  }

  public static againstInvalidEmail(
    value: string,
    argumentName: string,
  ): GuardResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(value)) {
      return {
        succeeded: false,
        message: `${argumentName} must be a valid email address.`,
      };
    }

    return { succeeded: true };
  }
}