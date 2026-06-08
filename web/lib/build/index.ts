import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { normalize } from "./normalize";
import { extractArtifact } from "./extract";
import {
  createBuildingVersion,
  persistArtifact,
  markFailed,
  type PersistResult,
} from "./persist";
import { generateAssessment } from "@/lib/assessment";

// The upload → artifact build pipeline (V2_DESIGN §3 / Phase B). Orchestrates:
//   PDF/text → normalize (text units) → extract (operators) → persist (typed rows).
// Returns the new corpus_version id; the serve layer then learns over it.

const MAX_CHARS = 60_000; // ~15 pages — keeps the artifact in-context (no RAG) + cost bounded

export type BuildOutcome =
  | { ok: true; result: PersistResult }
  | { ok: false; reason: string; versionId?: number };

/** Pull plain text out of a PDF buffer (serverless-safe, no native deps). */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

/** Build an artifact from already-extracted document text. Creates the version
 *  row first (status='building') so the reveal UI can poll, then fills it. */
export async function buildFromText(
  rawText: string,
  opts: { sessionId: string; owner: string | null; sourceName: string },
): Promise<BuildOutcome> {
  const text = rawText.slice(0, MAX_CHARS).trim();
  if (text.length < 200) {
    return { ok: false, reason: "too-short" };
  }

  const units = normalize(text);
  if (!units.length) return { ok: false, reason: "no-content" };

  const label = `upload:${opts.sessionId.slice(0, 8)}:${units.length}:${Date.now()}`;
  const versionId = await createBuildingVersion(label, opts.owner, opts.sourceName);

  try {
    const artifact = await extractArtifact(units, opts.sessionId);
    if (!artifact) {
      await markFailed(versionId);
      // The one thing template mode can't fake — extraction needs a live model.
      return { ok: false, reason: "extraction-unavailable", versionId };
    }
    const result = await persistArtifact(versionId, units, artifact);
    // Generate the doc-level pre/post assessment now, so it's ready when the
    // learner arrives (best-effort — the learning view works without it).
    try {
      await generateAssessment(versionId, opts.sessionId);
    } catch {
      /* assessment is optional; never fail the build over it */
    }
    return { ok: true, result };
  } catch (e) {
    await markFailed(versionId);
    return { ok: false, reason: e instanceof Error ? e.message : "build-failed", versionId };
  }
}
