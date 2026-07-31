export interface ApplicationError {
  code: string;
  message: string;
}

export type ApplicationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ApplicationError;
    };