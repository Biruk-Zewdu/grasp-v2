"use server";

import { buildFromText, pdfToText } from "@/lib/build";
import { getUserId } from "@/lib/server/identity";
import { versionStatus } from "@/lib/db/records";

// Server actions for the upload → build flow (Phase B). The heavy work (extract +
// persist) runs inside `build`; the reveal UI calls `buildStatus` to poll.

export type BuildResponse =
  | { ok: true; versionId: number; conceptCount: number; hasTension: boolean }
  | { ok: false; reason: string; versionId?: number };

/** Build an artifact from an uploaded PDF (FormData with a `file`) or pasted text. */
export async function build(form: FormData, sessionId: string): Promise<BuildResponse> {
  const userId = await getUserId(sessionId);
  const file = form.get("file");
  const pasted = form.get("text");

  let rawText = "";
  let sourceName = "Pasted text";

  try {
    if (file instanceof File && file.size > 0) {
      sourceName = file.name || "Uploaded PDF";
      const bytes = new Uint8Array(await file.arrayBuffer());
      rawText = file.name.toLowerCase().endsWith(".pdf")
        ? await pdfToText(bytes)
        : new TextDecoder().decode(bytes);
    } else if (typeof pasted === "string" && pasted.trim()) {
      rawText = pasted;
    } else {
      return { ok: false, reason: "no-input" };
    }
  } catch {
    return { ok: false, reason: "could-not-read-file" };
  }

  const outcome = await buildFromText(rawText, { sessionId: userId, owner: userId, sourceName });
  if (!outcome.ok) return { ok: false, reason: outcome.reason, versionId: outcome.versionId };
  return {
    ok: true,
    versionId: outcome.result.versionId,
    conceptCount: outcome.result.conceptCount,
    hasTension: outcome.result.hasTension,
  };
}

/** Poll a build's status (the reveal UI). */
export async function buildStatus(versionId: number) {
  return versionStatus(versionId);
}
