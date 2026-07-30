import {
  apiSuccess,
  handleApiError,
} from '../../../../lib/api';

export const runtime = 'nodejs';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';
const REFRESH_TOKEN_COOKIE = 'voka_refresh_token';

export async function POST() {
  try {
    const response = apiSuccess(
      {
        loggedOut: true,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );

    const secure =
      process.env.NODE_ENV === 'production';

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      '',
      {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      },
    );

    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      '',
      {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      },
    );

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
