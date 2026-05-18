import { createId, draftFromOcrText, type ImportDraft } from "@/lib/domain";

export const runtime = "nodejs";

type OcrSpaceResponse = {
  ParsedResults?: Array<{
    ParsedText?: string;
    ErrorMessage?: string | string[];
  }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
};

const ocrSpaceMaxBytes = 1_000_000;

function bufferToBlob(buffer: Buffer, type: string) {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return new Blob([arrayBuffer], { type });
}

function stringifyServiceError(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value.join(" ") : value;
}

async function preparePhotoForOcrSpace(file: File) {
  const originalBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const sharp = (await import("sharp")).default;
    let smallestBuffer: Buffer | null = null;

    for (const maxSide of [1800, 1500, 1200, 1000, 850]) {
      for (const quality of [78, 68, 58, 48, 40]) {
        const output = await sharp(originalBuffer, { failOn: "none", limitInputPixels: false })
          .rotate()
          .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
          .grayscale()
          .normalize()
          .sharpen()
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        if (!smallestBuffer || output.length < smallestBuffer.length) {
          smallestBuffer = output;
        }

        if (output.length <= ocrSpaceMaxBytes) {
          return {
            blob: bufferToBlob(output, "image/jpeg"),
            fileName: file.name.replace(/\.[^.]+$/, ".jpg") || "recipe-photo.jpg",
            warning: output.length < originalBuffer.length ? "The image was compressed server-side before online OCR." : ""
          };
        }
      }
    }

    if (smallestBuffer && smallestBuffer.length <= ocrSpaceMaxBytes) {
      return {
        blob: bufferToBlob(smallestBuffer, "image/jpeg"),
        fileName: file.name.replace(/\.[^.]+$/, ".jpg") || "recipe-photo.jpg",
        warning: "The image was compressed server-side before online OCR."
      };
    }
  } catch {
    if (originalBuffer.length <= ocrSpaceMaxBytes) {
      return {
        blob: bufferToBlob(originalBuffer, file.type || "application/octet-stream"),
        fileName: file.name || "recipe-photo",
        warning: "Server-side image conversion was not available, so the original upload was sent to online OCR."
      };
    }
  }

  if (originalBuffer.length <= ocrSpaceMaxBytes) {
    return {
      blob: bufferToBlob(originalBuffer, file.type || "application/octet-stream"),
      fileName: file.name || "recipe-photo",
      warning: ""
    };
  }

  throw new Error("This image could not be compressed under the free OCR limit. Try cropping to just the recipe page or exporting it as a smaller JPEG.");
}

async function callOcrSpace(apiKey: string, blob: Blob, fileName: string, engine: "1" | "2") {
  const fallbackForm = new FormData();
  fallbackForm.append("apikey", apiKey);
  fallbackForm.append("language", "eng");
  fallbackForm.append("OCREngine", engine);
  fallbackForm.append("scale", "true");
  fallbackForm.append("detectOrientation", "true");
  fallbackForm.append("isTable", "false");
  fallbackForm.append("file", blob, fileName);

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: fallbackForm
  });

  const responseText = await response.text();
  let payload: OcrSpaceResponse = {};

  try {
    payload = responseText ? (JSON.parse(responseText) as OcrSpaceResponse) : {};
  } catch {
    throw new Error(responseText || `The free online OCR service returned ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(`The free online OCR service returned ${response.status}.`);
  }

  const parsedResultError = payload.ParsedResults?.map((result) => stringifyServiceError(result.ErrorMessage)).find(Boolean) ?? "";
  const serviceError = stringifyServiceError(payload.ErrorMessage) || parsedResultError || (payload.IsErroredOnProcessing ? "OCR processing failed." : "");
  const text = payload.ParsedResults?.map((result) => result.ParsedText ?? "").join("\n").trim() ?? "";

  return { serviceError, text };
}

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

    let prepared: Awaited<ReturnType<typeof preparePhotoForOcrSpace>>;

    try {
      prepared = await preparePhotoForOcrSpace(file);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "The photo could not be prepared for online OCR." },
        { status: 413 }
      );
    }

    let serviceError = "";
    let text = "";

    try {
      ({ serviceError, text } = await callOcrSpace(apiKey, prepared.blob, prepared.fileName, "2"));

      if (serviceError || !text) {
        ({ serviceError, text } = await callOcrSpace(apiKey, prepared.blob, prepared.fileName, "1"));
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "The free online OCR service could not read the image." },
        { status: 502 }
      );
    }

    if (serviceError || !text) {
      return Response.json(
        { error: serviceError || "No text was found in the photo." },
        { status: 422 }
      );
    }

    const draft = draftFromOcrText(text, file.name);
    return Response.json({
      ...draft,
      warnings: Array.from(
        new Set([
          "Online OCR was used for this draft. Review carefully before saving.",
          ...(prepared.warning ? [prepared.warning] : []),
          ...draft.warnings
        ])
      )
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
