import {
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from 'jose';

import type {
  AuthTokenPair,
  AuthTokenPayload,
  AuthTokenType,
  TokenService,
} from '../../application';

export type JwtTokenServiceOptions = {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  issuer?: string;
  audience?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
};

export class JwtTokenService implements TokenService {
  private readonly accessTokenSecret: Uint8Array;
  private readonly refreshTokenSecret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;

  constructor(options: JwtTokenServiceOptions) {
    if (!options.accessTokenSecret.trim()) {
      throw new Error(
        'Access token secret is required.',
      );
    }

    if (!options.refreshTokenSecret.trim()) {
      throw new Error(
        'Refresh token secret is required.',
      );
    }

    this.accessTokenSecret = new TextEncoder().encode(
      options.accessTokenSecret,
    );

    this.refreshTokenSecret = new TextEncoder().encode(
      options.refreshTokenSecret,
    );

    this.issuer = options.issuer ?? 'voka';
    this.audience = options.audience ?? 'voka-web';
    this.accessTokenExpiresIn =
      options.accessTokenExpiresIn ?? '15m';
    this.refreshTokenExpiresIn =
      options.refreshTokenExpiresIn ?? '7d';
  }

  public async generateTokenPair(
    payload: Omit<AuthTokenPayload, 'type'>,
  ): Promise<AuthTokenPair> {
    const [accessToken, refreshToken] =
      await Promise.all([
        this.signToken(
          {
            ...payload,
            type: 'access',
          },
          this.accessTokenSecret,
          this.accessTokenExpiresIn,
        ),
        this.signToken(
          {
            ...payload,
            type: 'refresh',
          },
          this.refreshTokenSecret,
          this.refreshTokenExpiresIn,
        ),
      ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  public async verifyAccessToken(
    token: string,
  ): Promise<AuthTokenPayload> {
    return this.verifyToken(
      token,
      this.accessTokenSecret,
      'access',
    );
  }

  public async verifyRefreshToken(
    token: string,
  ): Promise<AuthTokenPayload> {
    return this.verifyToken(
      token,
      this.refreshTokenSecret,
      'refresh',
    );
  }

  private async signToken(
    payload: AuthTokenPayload,
    secret: Uint8Array,
    expiresIn: string,
  ): Promise<string> {
    return new SignJWT({
      email: payload.email,
      type: payload.type,
    })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setSubject(payload.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secret);
  }

  private async verifyToken(
    token: string,
    secret: Uint8Array,
    expectedType: AuthTokenType,
  ): Promise<AuthTokenPayload> {
    const verification = await jwtVerify(
      token,
      secret,
      {
        issuer: this.issuer,
        audience: this.audience,
      },
    );

    return this.toAuthTokenPayload(
      verification.payload,
      expectedType,
    );
  }

  private toAuthTokenPayload(
    payload: JWTPayload,
    expectedType: AuthTokenType,
  ): AuthTokenPayload {
    const userId = payload.sub;
    const email = payload.email;
    const type = payload.type;

    if (
      typeof userId !== 'string' ||
      typeof email !== 'string' ||
      type !== expectedType
    ) {
      throw new Error(
        'The authentication token is invalid.',
      );
    }

    return {
      userId,
      email,
      type: expectedType,
    };
  }
}
