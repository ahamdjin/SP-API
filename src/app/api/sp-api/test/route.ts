import { credentialsSchema } from "@/lib/schemas";
import { getAccessToken, privateHeaders, toErrorResponse } from "@/lib/sp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credentials = credentialsSchema.parse(await request.json());
    const token = await getAccessToken(credentials);
    return Response.json(
      { ok: true, expiresIn: token.expiresIn, message: "Amazon issued an access token successfully." },
      { headers: privateHeaders },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
