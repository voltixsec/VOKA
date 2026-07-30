import { apiSuccess, withAuth } from '../../../../lib/api';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (_request, auth) =>
    apiSuccess(auth, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }),
);
