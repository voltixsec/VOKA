import { JwtTokenService } from '../../features/user/infrastructure/security/JwtTokenService';

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is missing.`,
    );
  }

  return value;
}

export function createTokenService(): JwtTokenService {
  return new JwtTokenService({
    accessTokenSecret:
      getRequiredEnvironmentVariable(
        'JWT_ACCESS_SECRET',
      ),
    refreshTokenSecret:
      getRequiredEnvironmentVariable(
        'JWT_REFRESH_SECRET',
      ),
    issuer:
      process.env.JWT_ISSUER?.trim() || 'VOKA',
    audience:
      process.env.JWT_AUDIENCE?.trim() ||
      'VOKA-WEB',
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
  });
}
