# Grasp v2 — Design & Plan

## Canonical spec for the upload-driven version · supersedes v1's frozen-corpus model for the demo

> **v1 in one line.** A hand-curated, *frozen* knowledge artifact (85 concepts, 9 tensions) that a cheap serve layer reasons over. Intelligence-in-the-design was enforced by **human curation**. Live + untouched at its own Vercel URL; this project does not modify it.
>
> **v2 in one line.** The student **uploads a PDF**; the system runs the **same course-derived operators online** to turn it into a typed, grounded, *possibly-contested* knowledge artifact, then **teaches it** — a generated lesson + an interactive guide + a before/after assessment. Intelligence-in-the-design is now enforced by **the operators + the typed schema + validation + the tension-preservation guard**, not by hand-curation.

---

## 1. Why v2 exists (the professor's ask)

The professor's requirement: *"the common assumption is the student uploads a PDF of what he wants to understand… show what the system does with the input PDF to output."* v1 never ingested a user PDF — its corpus was pre-built by hand. v2 closes exactly that gap: **PDF in → structured knowledge out → taught back.** The transformation *is* the demo.

Secondary driver: v1 was **too rigid** — it overfit the lecture material, starting from a schema that *required* a paradigmatic tension in every unit. v2 deliberately **takes the lesson from a few course ideas deeply rather than overfitting all of them** (the professor's stated preference). The schema loosens; the tension becomes *detected, not required*.

---

## 2. The thesis, restated for a machine-built artifact (the defence)

The slogan **"intelligence is in the design, not the weights"** must survive the move from hand-curation to auto-extraction. It does, *because the design relocates*:

| In v1 the design was… | In v2 the design is… |
|---|---|
| a hand-curated, frozen corpus | the **extraction operators** (a fixed, course-derived procedure the LLM executes) |
| a schema that enforced structure | a **typed schema + validation** the extracted artifact must satisfy |
| the verbatim tension guard | **the same guard** — the model may detect/point at a tension, never author or resolve it |

The LLM is the **instrument that executes operators over a knowledge representation** (SYSTEM_DESIGN §7's original claim, honoured literally). Strip the operators + schema + guard and it's a chatbot; keep them and it is a physical symbol system. **This is the line to defend: the intelligence is in *what we do with the retrieved/extracted structure*, not in the extractor.**

---

## 3. The architecture — and why it is small

The key realisation that keeps v2 small: **the artifact in Postgres is already the contract between build and serve, and the serve layer is already version-parameterised** (`getArtifactContext(versionId)`, `frozenVersion(label)`). v1 froze one artifact and hardcoded its id; v2 builds a *per-upload* artifact and passes *its* id. **The Guide, the tension renderer, the provenance pull, the cost guards all work unchanged.**

```
┌──────────────────────── BUILD (new — runs on upload) ─────────────────────────┐
│  upload PDF → normalize to text units → OPERATORS (the v1 build/ pipeline):    │
│     concepts · relations · claims · [DETECT tension] · anchor provenance       │
│  → VALIDATE (typed, grounded, anchored) → write ARTIFACT rows (loosened schema)│
│  → generate: lesson-per-subtopic + a doc-level assessment (cached)             │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │  artifact (Postgres) = the build↔serve contract
┌───────────────────────────────────────▼─────────────────────────────────────────┐
│  SERVE (mostly REUSED from v1) — point everything at the uploaded version id     │
│     Reveal (new) · Lesson reader (new) · Guide (reused) · Assessment (new)       │
│     renderTension verbatim (reused) · provenance pull (reused) · budget (reused) │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### No vector RAG in v2 (deliberate scope cut)
RAG exists to handle documents too large for the context window. The demo's inputs are **doc-sized (~5 pages)**; once extracted, the artifact is *small* — it fits in-context exactly as v1's 85-concept corpus did. So **the hard new part is EXTRACTION (PDF → artifact), not retrieval.** Vector RAG / large-doc handling / LightRAG / a Python RAG service are **deferred to vNext**. This removes a whole dependency and a whole thesis-erosion risk. (pgvector stays available for vNext, unused in v2 — same posture as v1.)

### What's reused vs new vs cut

| | Item |
|---|---|
| **Reused as-is** | the agentic Guide, `renderTension` (verbatim cells), provenance pull, budget/cost guards, anon auth, the version-parameterised `getArtifactContext`, the v1 `build/` extraction operators, `validate.py` |
| **New (core)** | upload UI + extraction-as-a-job, the **transformation-reveal** screen, artifact **version selection** (which artifact this session learns), **schema loosening** (tension optional), the **lesson rail + lesson generator**, **pre/post assessment** |
| **Cut — NOT v2** | vector RAG / large-doc handling, LightRAG/LlamaIndex, voice / video / avatar tutor, podcast, arcade, flashcards, accounts/personalisation beyond v1's anon auth |

---

## 4. Course-idea map (every core feature ties to a lesson — lead with the first two)

| Core feature | Lesson | How it *is* that idea |
|---|---|---|
| **PDF → typed concepts/relations/claims** | **KRR / Representation** | the document becomes a *symbolic structure* reasoned over — the literal input→output the professor asked for. **Headline.** |
| **Guide + Lesson walking learner to grasp** | **Means-ends analysis (Simon search)** | learner state = goal; each move = an operator reducing the difference. **Headline.** |
| **Decomposition into subtopics + lesson rail** | **Simon's watchmaker / near-decomposability** | understanding assembled bottom-up from stable sub-assemblies |
| **Tension detected → both sides verbatim** | **Pluralism / due process (Hewitt, S9)** | a contested point held open, never resolved by the machine — the differentiator vs NotebookLM/StudyFetch |
| **Provenance + ground-or-abstain** | **TMS / truth maintenance (S8)** | every claim traces to its source; outside the doc → abstain |
| **Pre → post assessment delta** | **Credit assignment / economy (S1)** | measuring what the learning actually moved |

**Explicitly NOT applied** (say so — taking a few ideas deep, not overfitting): formal logic / ontology formalisation (v1's rigidity, dropped on purpose), evolution / rugged landscapes, constraint satisfaction, cellular automata. v2 also **reverses v1's "no embeddings" stance is *not* triggered** — embeddings stay deferred because doc-sized inputs don't need them (choosing the representation that fits the problem — itself a Simon move).

---

## 5. The data model (loosened from v1)

The single most important schema change: **tension is optional (0..n per artifact), not required.** Floor = grounded concepts + claims + provenance (any PDF yields this); ceiling = preserved tension (only when genuinely present — never fabricated).

Core tables (fresh v2 schema, brand-new Supabase project):
- `corpus_version` — each upload is a version (`origin`: `uploaded` | `example`; `owner`; `status`: building/ready/failed).
- `entity` (concepts), `relation`, `claim`, `provenance`, `text_unit` — as v1, but no field *requires* a tension.
- `tension` — **0..n**, each links two claims + conditions; rendered verbatim when present.
- `subtopic` (or derived from concept clustering) — the decomposition for the lesson rail.
- `lesson` — generated teaching write-up per subtopic (cached).
- `assessment` — the doc-level question set (pre = post pool) + answer keys, generated once.
- runtime tables from v1 (`app_session`, `usage_counter`, `gap_log`, `gesture_log`) — reused.

**Backward-compatibility is NOT required** (separate DB, separate project) — so the schema is designed clean for upload-first, no contortions to keep v1 happy.

---

## 6. The surface (UI — leans toward StudyFetch)

The flow mirrors StudyFetch's legible shape (upload → processing → study-path with tools), stripped of its gloss (no voice/video/avatar/podcast/arcade):

1. **Upload** — drop a PDF (cap ~10–15 pages: "works best on focused materials" — honest, on-thesis economy). Plus a one-click **"try an example"** (a pre-baked artifact) for instant content.
2. **Transformation-reveal** ("Building your knowledge map…") — *shows the operators working*: text units → concepts found → relations linked → **"contested point detected: yes/no"** → sources anchored → ready. This turns the ~15–40s extraction wait into the professor's money shot.
3. **Study path** (StudyFetch-style) — left rail of **subtopics** (the decomposition); per subtopic a **Lesson** (generated teaching material); a persistent **Guide** for ask / go-deeper / opposing-view / source; the **tension** rendered verbatim where detected.
4. **Pre-assessment** (before) and **Post-assessment** (after) bracket the experience; a payoff screen shows the **before→after delta** and flags shaky subtopics.

**Tutor = teaching material, not a live teacher.** The "tutor" is a generated, readable **lesson** (calm, text, grounded), and the *interactivity* lives in the Guide beside it. No live voice tutor (the StudyFetch aggression we explicitly avoid). Optional cheap stretch: reveal a lesson section-by-section with a "Next" button (paced reading, not a live tutor).

---

## 7. The phases (scope-fenced; A–G is the demo)

- **A — Loosened v2 schema + new Supabase.** Fresh schema (tension 0..n, claims/relations core, artifact origin+owner+status). Brand-new Supabase project. Pydantic + Drizzle mirrors. *Foundation.*
- **B — Extraction on upload.** Upload endpoint → store → trigger `build/` operators → validate → write artifact rows → mark ready. Reuse the Python pipeline. Pre-bake 1–2 example artifacts.
- **C — Transformation-reveal UI.** The processing screen that shows operators working (§6.2).
- **D — Repoint serve at the uploaded artifact.** Swap hardcoded `frozenVersion(v1)` for the session's selected version id. Guide/tension/provenance work unchanged. Handle no-tension gracefully.
- **E — Decomposition → lesson rail.** Subtopics → left-rail study path (reuse basics-path machinery). Click → Guide answers grounded.
- **F — Lesson generator (teaching material).** Per-subtopic write-up from the artifact: title/framing, grounded explanation, inline key terms, **verbatim tension if detected**, sources. Model composes prose; tension block stays verbatim. Cached.
- **G — Pre/post assessment.** Doc-level ~4–6 MC questions from claims (not per-subtopic); pre = baseline, post = same pool; before→after delta; grading deterministic against stored key; generated once at build, cached.

**— line in the sand: A–G is the demo. Stretch only after it ships: paced section reveal; per-subtopic probe; confidence-weighted scoring. NO voice/RAG/flashcards. —**

---

## 8. Demo script (the thing shown to the professor)

1. **"Here's an example"** → a pre-baked artifact loads instantly (proves the learning experience without waiting).
2. **"Now watch it build from a real PDF"** → upload course notes → **transformation-reveal** runs: concepts assemble, relations link, *"contested point detected,"* sources anchor. **← the answer to the professor's exact ask.**
3. **Pre-assessment** → a few quick questions ("what do you already know?").
4. **Learn** → read the generated **Lesson**; use the **Guide** to ask / go deeper; a key term glosses; a source is one click away.
5. **Hit the tension** → both sides render verbatim, unresolved. *"This is what NotebookLM / StudyFetch can't do."*
6. **Post-assessment** → before→after delta. Done.

Legible (looks like a real tool), demoable (clear PDF→output), defensible (transformation + means-ends + pluralism all visible, all course ideas).

---

## 9. Cost & latency budget (computed, not guessed)

A ~5-page PDF ≈ ~5K tokens of source. Pipeline ≈ 6–8 sequential structured calls (extract concepts/relations/claims, detect tension, anchor provenance, generate ~4 lessons, generate assessment).

- **Tokens:** ≈ 40K input + 9K output per upload.
- **Cost:** ≈ **$0.03–0.08 per upload** (mid tier); ~$0.10–0.25 worst case with a bigger model + retries. **Negligible** under the existing $10/mo hard cap (~100–300 live uploads).
- **Latency:** ≈ **15–40s** wall-clock (sequential calls). **This, not cost, is the design constraint** — which is exactly why the reveal screen (§6.2) turns the wait into the feature.
- **Mitigations:** cap upload size (~10–15 pages); cache built artifacts (re-view = $0); pre-baked examples for instant demo content; one live upload to prove it's real.

---

## 10. Risks & mitigations

1. **Thesis erosion (auto-build vs hand-curation).** → keep operators + typed schema + validation + tension guard visible and central (§2); the reveal screen *shows* the design working.
2. **Not every PDF has a tension.** → tension detected, not required (§5); graceful degrade to grounded concepts/claims; never fabricate a fork.
3. **Auto-extraction quality < hand curation.** → validation gates catch the worst; keep v1 frozen corpus as the "gold standard" showcase; frame v2 honestly as "the pipeline, automated."
4. **Running the Python builder in prod** (Vercel ≠ long Python jobs). → the artifact in Postgres is all serve needs; the builder can run as a small worker / separate step; demo can pre-bake + do one live upload.
5. **Scope creep.** → phases fenced (§7); voice/RAG/flashcards/podcast/arcade stay cut.

---

## 11. Relationship to v1 (rollback guarantee)

v2 is a **separate project**: new private repo (`grasp-v2`), new Vercel project, **brand-new Supabase DB**. v1's repo, deployment, and database are **untouched**. There is therefore nothing to "roll back" — v1 stays live as the guaranteed fallback while v2 is built and demoed independently. v2 starts from a **copy** of v1's proven serve layer (`web/`) + `build/` pipeline, then diverges.
