import { apiSuccess, handleApiError } from '../../../lib/api';

export async function GET() {
  try {
    return apiSuccess({
      status: 'ok',
      service: 'VOKA API',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}