import { createId, draftFromOcrText, type ImportDraft } from "@/lib/domain";

type OcrSpaceResponse = {
  ParsedResults?: Array<{
    ParsedText?: string;
    ErrorMessage?: string;
  }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("photo");
  const source = formData.get("source");

  if (!(file instanceof File)) {
    return Response.json({ error: "A recipe photo is required." }, { status: 400 });
  }

  if (source === "ocr-space") {
    const apiKey = process.env.OCR_SPACE_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "OCR_SPACE_API_KEY is not configured." }, { status: 501 });
    }

    if (file.size > 1_000_000) {
      return Response.json({ error: "The compressed photo must be under 1 MB for the free OCR fallback." }, { status: 413 });
    }

    const fallbackForm = new FormData();
    fallbackForm.append("apikey", apiKey);
    fallbackForm.append("language", "eng");
    fallbackForm.append("OCREngine", "2");
    fallbackForm.append("scale", "true");
    fallbackForm.append("isTable", "false");
    fallbackForm.append("file", file);

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: fallbackForm
    });

    if (!response.ok) {
      return Response.json({ error: "The free online OCR service could not read the image." }, { status: 502 });
    }

    const payload = (await response.json()) as OcrSpaceResponse;
    const serviceError =
      payload.ErrorMessage ||
      payload.ParsedResults?.find((result) => result.ErrorMessage)?.ErrorMessage ||
      (payload.IsErroredOnProcessing ? "OCR processing failed." : "");
    const text = payload.ParsedResults?.map((result) => result.ParsedText ?? "").join("\n").trim() ?? "";

    if (serviceError || !text) {
      return Response.json(
        { error: Array.isArray(serviceError) ? serviceError.join(" ") : serviceError || "No text was found in the photo." },
        { status: 422 }
      );
    }

    const draft = draftFromOcrText(text, file.name);
    return Response.json({
      ...draft,
      warnings: Array.from(new Set(["Online OCR was used for this draft. Review carefully before saving.", ...draft.warnings]))
    });
  }

  const draft: ImportDraft = {
    id: createId("draft"),
    title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") || "Recipe book import",
    servings: 4,
    mealTypes: ["dinner"],
    tags: ["photo import"],
    ingredients: [],
    instructions: ["Review the photo and add or correct the extracted method."],
    importedFrom: "photo",
    warnings: [
      "Photo import is ready for review. Connect an OCR or AI vision provider to pre-fill ingredients automatically.",
      "Nothing has been saved to the recipe library yet."
    ]
  };

  return Response.json(draft);
}
