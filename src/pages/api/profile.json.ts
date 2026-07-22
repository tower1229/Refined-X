import { getPublicProfile, jsonResponse } from '../../lib/public-data';

export async function GET() {
	return jsonResponse(await getPublicProfile());
}
