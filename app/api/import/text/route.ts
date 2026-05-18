import { parseRecipeText } from "@/lib/domain";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();

  if (!text) {
    return Response.json({ error: "Recipe text is required." }, { status: 400 });
  }

  return Response.json(parseRecipeText(text, "paste"));
}
