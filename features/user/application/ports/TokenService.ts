export type AuthTokenType = 'access' | 'refresh';

export type AuthTokenPayload = {
  userId: string;
  email: string;
  type: AuthTokenType;
};

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export interface TokenService {
  generateTokenPair(
    payload: Omit<AuthTokenPayload, 'type'>,
  ): Promise<AuthTokenPair>;

  verifyAccessToken(
    token: string,
  ): Promise<AuthTokenPayload>;

  verifyRefreshToken(
    token: string,
  ): Promise<AuthTokenPayload>;
}
