# VAJRA Implementation Plan: real pipeline, honest UI, persistent chat

**Status:** Approved, in progress · **Created:** 2026-09-08 · **Owner:** engineering

This plan supersedes the roadmap in [LLM_HANDOFF_FINDINGS_AND_TODOS.md](./LLM_HANDOFF_FINDINGS_AND_TODOS.md).
Its P1 (multi-turn history) is folded into Phase 2 and its P2 (grounded RAG in runs) into
Phase 1 — P2 is in fact already half-implemented in the working tree. Companion documents:
[ARCHITECTURE.md](./ARCHITECTURE.md), [API_REFERENCE.md](./API_REFERENCE.md),
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

---

## Context

VAJRA is an airgapped on-premise agentic AI workbench (SIH 2026, PS 26117). Its subsystems are
largely well-built — a 7-factor routing engine, a RAG ingest/retrieve pipeline, an event-sourced
log with SSE replay, an in-process egress guard. The problem is that **the run path doesn't use
most of them**, and **the frontend fabricates whatever the backend doesn't send**.

Three failures compound:

1. **The pipeline bypasses its own machinery.** `AgentRunExecutor` does inline
   `if "code" in prompt.lower()` matching instead of calling the `RouterEngine` that is
   constructed and injected for it. ~900 LOC of router (classify/filters/scoring/policy) is
   unreachable from a run. The Score Simulator on `/routing` and the actual run are computed by
   *different code*, so the simulator's numbers describe a decision the system did not make.
2. **Both ends invent data.** The backend hardcodes the sovereignty verdict
   (`"airgap_audit": "PASS"`, `external_egress_attempts: 0`) and counts stream chunks as tokens.
   The frontend hardcodes model names, candidate scores and step latencies, and — worst —
   `triggerFallbackCompletion` synthesises a plausible assistant reply when a run **fails**,
   tagged `isMock: false`.
3. **Nothing is remembered.** Chat lives in React `useState`; a refresh destroys it. There is no
   conversation or message table anywhere, and the assistant's reply is only ever in a transient
   SSE payload and `run_steps.output` — which `RunStepRead` deliberately omits.

For a product whose whole claim is *verifiable* local execution, fabricated telemetry isn't
cosmetic. It's the one defect class that invalidates the claim.

### Outcome

Every number shown is measured. Every routing decision is made by the router and explainable.
Conversations persist. Attachments actually reach the model. Pages either do what they imply or
say plainly that they don't.

### Decisions taken

- **Mocks deleted.** `lib/mockData.ts` and the `fetchWithFallback` mock path go entirely.
- **Chat history:** dedicated `conversations` + `messages` tables.
- **Implement:** multimodal, data-analysis, analytics, login/auth.
- **Knowledge graph:** built from *real* ingested documents via cheap heuristics, labelled as
  heuristic — not a claimed NER pipeline.
- **Workflows: deferred**, relabelled so it stops implying it executes.

---

## Phase 0 — Unblock

- **`apps/api/vajra/orchestrator/service.py:29`** — `Any` is used 16× but never imported.
  `ruff check .` fails with 16 × F821; it only survives at runtime because of
  `from __future__ import annotations`. Add the import, then replace the load-bearing `Any`s
  with real types as part of Phase 1.
- Fix the remaining 23 ruff errors (20 × E501, 2 × I001, 1 × B905 — the unstrict `zip()` at
  `service.py:362`). `ruff check .` must pass; the README badge claims it already does.
- **`tests/conftest.py:47-56`** — drop `PathSettings(base_dir=, logs_dir=)` and
  `DatabaseSettings(pool_size=, timeout_seconds=)`. Those fields don't exist, Pydantic ignores
  them silently, so the fixtures aren't configuring what they appear to.
- **`service.py:130`** — use `save_step()` rather than a second `add_step()`. Not currently a
  bug (`expire_on_commit=False` keeps the identity key, so the re-`add` flushes an UPDATE), but
  it's the wrong call and breaks the moment the two calls stop sharing an identity map.

---

## Phase 1 — Make the run pipeline tell the truth

The core of the work. Ships independently.

### 1.1 Extract candidate assembly → `apps/api/vajra/orchestrator/candidates.py` (new)

`build_candidates`, `load_policies`, `to_candidate`, `_host_is_loopback`, `_parse_modalities`
currently live in `apps/api/vajra/api/routing.py:85-188` and take `AppContext`. The enforced
import direction (`api → orchestrator → services → store/events → core`) means the orchestrator
cannot import them. Move them to `orchestrator/candidates.py`, taking explicit dependencies
(`registry`, `runtimes`, `residency`, `database`) instead of `AppContext`.

`vajra/router/models.py:75` already states this intent verbatim: *"Building candidates in the
orchestrator rather than letting the router read the database is what keeps the router a pure,
testable function."* Do not put it in `registry/` — `router/filters.py:16` already imports
`registry.capabilities`, so that would create a package cycle.

Keep `api/routing.py` working with two thin `AppContext`-shaped delegates. Net effect:
`/api/routing/simulate` and the run path score against an **identical** candidate set.

Add `is_service_model(record)` here — returns `True` when every declared capability is in
`SERVICE_CAPABILITIES` (`registry/capabilities.py:43`). **This replaces the `role` idea
entirely**: `getattr(m, "role", "") != "embedding"` at `service.py:233` is a permanent no-op
because `ModelRecord` has no `role` column, and filtering on declared capabilities is strictly
better — it's data the router already understands, it's probe-verifiable, and it needs **no
ALTER TABLE**. Leave `ProfileModelConfig.role` as YAML documentation.

### 1.2 History-aware sizing → `router/classify.py`, `router/engine.py`

Add a keyword-only `extra_input_chars: int = 0` to `extract_features`, the `TaskClassifier`
protocol, `LexiconTaskClassifier.classify` and `RouterEngine.classify`. Zero default, so no
existing caller breaks. Without it, once server-side history enters the prompt the context
filter (`filters.py:125`, `CONTEXT_MARGIN = 1.3`) is sizing against a lie.

### 1.3 Rewrite the classify step in `AgentRunExecutor`

Replace `service.py:202-321` wholesale — the inline keyword matching (224-291) and the
`or bool(att_data)` image bug (267-273) both go.

New `_classify_and_route()` returning a frozen `RouteOutcome(spec, decision, record,
runtime_model_id, runtime_id, num_ctx, max_output_tokens)`:

1. `spec = await router.classify(run_id, prompt, router_attachments, extra_input_chars=...)`
2. Emit **real** `TASK_CLASSIFIED` — `intent=spec.intent.value` plus complexity, classifier,
   required/preferred capabilities, `estimated_input_tokens`. Today `service.py:306` hardcodes
   `intent="general_reasoning"`, which isn't even a valid `TaskIntent` member.
3. `build_candidates(...)` → `load_policies(...)` → `router.route(spec, candidates, ctx, policies=)`
4. Emit `MODEL_CANDIDATES` with **real** scores and per-term contributions from
   `decision.candidates`, plus `rejected` and `rejection_summary()` (already exists,
   `engine.py:129`). This event type is already in the vocabulary and has never been emitted —
   it's precisely why the frontend invents the shootout.
5. Emit `MODEL_SELECTED` with model/runtime ids, display name, score, rationale, fallbacks,
   `policy_applied`, `decided_in_ms`.
6. Persist `step.routing_decision = decision.model_dump(mode="json")` — **load-bearing**,
   because `RunStepRead` omits `input`/`output`, so this is the only field through which
   `GET /api/runs/{id}/steps` can ever surface routing. Also populate `RunRecord.task_spec`,
   a column that has never been written.

**`NoCandidateModels` handling:** mark the step `FAILED` with the rejection list, emit
`NODE_FAILED`, re-raise. `RunOrchestrator._run` already converts that to `RUN_FAILED`. Closing
the step matters — today *any* mid-run exception leaves the step row stuck `RUNNING`.

### 1.4 Type the constructors → `service.py`, `core/dependencies.py`

Make `registry`, `runtimes`, `router` **required** on `AgentRunExecutor` and drop the
`if self._registry is not None:` degradation branch — that branch is what carries the hardcoded
`"general-reasoning"` / `"qwen3:8b"` fallback, a model family name outside `config/` that the
project's own architecture rules forbid.

In `build_context`, hoist `residency`, `router_engine` and `ledger` to locals and pass them into
`RunOrchestrator`. This also fixes the double construction: `RouterEngine()` is currently built
twice (`dependencies.py:112` and `:118`), so the simulator and the run path are literally
different engine instances.

### 1.5 Stop fabricating measurements

- **Token counts.** `service.py:459` does `token_count += 1` per delta and reports it as tokens.
  Ollama already returns the truth on the final chunk (`runtimes/ollama.py:294-295`, from
  `prompt_eval_count`/`eval_count`), and `ChatChunk.tokens_per_sec` is a computed property.
  Accumulate `prompt_tokens`/`completion_tokens`/`eval_duration_ms` from the stream. When the
  runtime reports nothing, record `tokens_measured: False` and leave the count at zero —
  **never substitute the chunk count.**
- **`ChatRequest` context.** Built at `service.py:449` with `num_ctx=None` and
  `max_output_tokens=None`, so Ollama silently falls back to its own default (often 2048/4096)
  and truncates **from the front**, dropping the system prompt and retrieved context. Set both
  from the winning `ModelRecord`.
- **The verify step.** `service.py:513-517` hardcodes `airgap_audit: "PASS"` and
  `external_egress_attempts: 0`, then emits `VERIFICATION_PASSED` — nothing is measured. This is
  the single most serious honesty defect in the repo, in the exact place the product's claim
  rests. Replace with a real **three-state** verdict: capture `EgressGuard.blocked_count`
  (`sovereignty/guard.py:149`, documented as "a real counter") at run start, diff at verify, and
  read `NetworkLedger.snapshot()` (whose counts are explicitly `None` when the poll fails).
  - `pass` — measured and clean → `VERIFICATION_PASSED`
  - `fail` — measured and dirty → `VERIFICATION_FAILED`
  - `unverified` — guard absent or audit unavailable → **emit neither**; carry the verdict on
    `NODE_COMPLETED`. A green PASS derived from an unavailable sensor is worse than no badge.

  Don't fail the run on a dirty verdict by default; gate it behind
  `settings.sovereignty.fail_run_on_egress: bool = False`.
- **Emit `RAG_QUERY` / `RAG_RESULTS` from the executor.** Today only `api/knowledge.py` does, so
  the run graph shows a retrieve node with zero retrieval events.

---

## Phase 2 — Chat history

### 2.1 Tables → `store/models.py`, `core/enums.py`

Both are new tables, so `create_all` handles them with **no migration** (it creates missing
tables, never missing columns).

- **`ConversationRecord`** (`conversations`) — `id`, `project_id`, `title`, `title_locked`,
  `pinned`, `archived`, denormalised `message_count`/`total_tokens`/`last_model_id`/
  `last_message_at`, `created_at`, `updated_at`. Index on `updated_at`.
- **`MessageRecord`** (`messages`) — `id`, `conversation_id` FK, `ordinal`, `role`, `content`,
  `status`. Assistant-turn provenance: `run_id` FK, `model_id`, `runtime_model_id`,
  `prompt_tokens`, `completion_tokens`, `tokens_per_sec`, `duration_ms`, `citations` JSON,
  `attachments` JSON, `error`. `UniqueConstraint(conversation_id, ordinal)`.
- New `MessageStatus` enum: `PENDING | STREAMING | COMPLETE | FAILED | CANCELLED`.

Two disciplines that matter:

- Token fields are `int | None`, **not** `int = 0`. NULL means "the runtime didn't report";
  a 0 would be a fabricated measurement.
- `citations` stores the **full dicts** from `build_citations` (`rag/citations.py:52`) —
  `marker`, `chunk_id`, `document_id`, `page_from`, `section_path` — not the
  `f"{doc_title} ({section_path})"` strings built at `service.py:363`, which throw away the
  chunk id and make "jump to source" impossible.

### 2.2 `ConversationRepository` → `store/repositories/conversations.py` (new)

CRUD plus `next_ordinal`, `add_message`, `save_message` (merge), `list_messages`, and
`tail_messages(limit)` so a 300-turn conversation doesn't load 300 rows to build a 4-turn
prompt. `delete` must remove messages before the parent — `PRAGMA foreign_keys=ON` is set
(`database.py:43`) and the FK has no cascade. Same pattern as `KnowledgeRepository.delete_document`.

### 2.3 `ConversationService` → `orchestrator/conversations.py` (new)

CRUD delegates plus the three orchestrator hooks:

- **`open_turn(conversation_id, prompt, attachments) -> TurnHandle`** — allocates **both**
  ordinals and inserts **both** rows (user `COMPLETE`, assistant `PENDING`) in one transaction.
  The `UniqueConstraint` makes concurrent runs on one conversation a real race; one transaction
  under SQLite WAL's single-writer model makes allocation atomic. Catch `IntegrityError` and
  retry once. It also gives the frontend a stable `assistant_message_id` to stream into.
- **`bind_run(handle, run_id)`**
- **`close_turn(handle, ...)`** — fills the placeholder with content, model, measured tokens,
  duration and citations; updates conversation counters.
- **`history_for(conversation_id, exclude_message_ids=...)`** — stored turns, oldest-first.

Auto-titling is deterministic, no LLM call: first line of the first prompt, collapsed, 72 chars.
A `PATCH` with a title sets `title_locked = True`.

### 2.4 History budgeting → `orchestrator/budget.py` (new, pure)

`budget_history(turns, budget_tokens, min_turns=2)` and
`history_budget_tokens(num_ctx, max_output_tokens, system_tokens, retrieval_tokens, prompt_tokens)`.

This is genuinely tight on the target profile and must be surfaced, not hidden:

```
 8192  num_ctx (laptop-8gb)
-2048  reserved for generation
-2100  retrieval context (3 × 700)
- 250  system preamble
- 200  typical prompt
─────
 1594  tokens for history ≈ 6 400 chars ≈ 4-6 short turns
```

Two consequences to design for:

- **Chicken-and-egg:** the budget depends on `num_ctx` → the selected model → classification →
  the history size. Resolve with a conservative pre-pass against `min(usable_context)` over
  enabled non-service candidates, then leave any headroom the winner has unused. Deterministic
  beats optimal; never re-budget upward mid-run.
- **Report the drop.** Put `{source, turns_kept, turns_dropped, truncated_chars, budget_tokens}`
  on the step output and on `TASK_CLASSIFIED`, so the composer can say "8 earlier turns omitted
  to fit the 8K context" instead of the model mysteriously forgetting.

### 2.5 Endpoints → `api/conversations.py` (new), registered in `api/__init__.py`

`GET/POST /api/conversations`, `GET/PATCH/DELETE /api/conversations/{id}`,
`GET /api/conversations/{id}/messages`. Read models `ConversationRead`, `ConversationDetail`,
`MessageRead`, `ConversationListPage` in `orchestrator/models.py`.

`DELETE` removes messages and the conversation but **not** the `RunRecord`s — runs are the audit
trail, and the FK points from messages to runs, so nothing dangles.

### 2.6 Orchestrator wiring

`RunCreateRequest` gains `conversation_id: str | None`. On `create`: `open_turn` → create run →
`bind_run`; `RUN_CREATED` carries `conversation_id`, `user_message_id`, `assistant_message_id`
so the frontend binds optimistic UI to real ids. `_mark_terminal` and `cancel` call `close_turn`
with `FAILED`/`CANCELLED` so a failed run never leaves a `PENDING` bubble.

**Phase out `history` by precedence, not removal.** `RunCreateRequest` has `extra="forbid"`, so
deleting the field 422s the current frontend on its first request. Keep it, mark it
`Field(deprecated=True)` (surfaces in `/api/docs` and OpenAPI), and ignore it whenever
`conversation_id` is present. Record which source was used in the step output
(`history_source: "server" | "client" | "none"`) so the deprecation is visible in the inspector.
Delete the field one release after the frontend stops sending it.

### 2.7 Additive schema-sync → `store/schema_sync.py` (new)

Not needed by anything above (§1.1 avoids the only ALTER), but ship it now: `create_all` will
silently no-op on every future column addition to `conversations`/`messages`, and the resulting
`OperationalError: no such column` at query time is the worst possible failure mode.

`sync_additive_columns(engine)` diffs `SQLModel.metadata` against `PRAGMA table_info` and issues
`ALTER TABLE ... ADD COLUMN`. **Strictly additive** — never drops, renames, retypes or reorders.
Anything SQLite can't do safely (PK, NOT NULL without default, UNIQUE, FK with non-NULL default)
is reported as a loud `ManualMigration`, never silently skipped. Stdlib + SQLAlchemy only; no
Alembic, which fits this project's "module boundaries over machinery" ethos. Wire into
`Database.init()` behind `DatabaseSettings.auto_migrate: bool = True`.

---

## Phase 3 — Attachments: one path

Today there are two disconnected paths: a chat attachment is base64'd into `runs.attachments`
and **only images are ever used**; a knowledge upload goes through the RAG ingestor. So a PDF
attached in chat is stored and silently dropped, and the model is asked about a document it
never received. Worse, the frontend only base64s images at all (`app/page.tsx:127-135`), so a
non-image attachment sends `[{filename}]` — a bare string.

### 3.1 `AttachmentIntake` → `rag/intake.py` (new)

Sits in the RAG service layer so both `api/knowledge.py` and the orchestrator may use it.
`intake(content, filename, mime, ...) -> IntakeResult` with disposition
`INDEXED | DEDUPED | IMAGE | UNSUPPORTED | FAILED`.

- **Kind routing is mime-first, extension-second, and never `bool(data)`.** The current
  `service.py:272` check (`... or bool(att_data)`) makes *any* base64 payload an "image" and
  hands a `.docx` to a vision model as a picture.
- Files that are neither image nor in the parseable allowlist get **sniffed**: first 8 KB decodes
  as UTF-8 with <1% control chars → treat as text and ingest. `.docx`/`.xlsx`/`.pptx` are ZIP
  containers and correctly fail this; so do PNG bytes.
- **Persist every byte to disk regardless of kind**, content-addressed at
  `uploads_dir/<sha256>/<filename>`. That's an auditability property, not a convenience.
- **Dedupe by sha256** via a new `KnowledgeRepository.get_document_by_sha256` (the column is
  already indexed, `store/models.py:155`). Re-attaching the same 200-page PDF in turn 7 costs
  one hash. A prior `FAILED` record is retried in place, not duplicated.
- **Unsupported files:** the run continues **ungrounded**, and the step output carries
  `unsupported: [{filename, reason}]` plus an `ATTACHMENT_SKIPPED` event. The user must be told
  the file was not read — the alternative (silently proceeding) is what happens today.
- Images get `DocumentStatus.SKIPPED` (new enum member; the column is TEXT, so **no ALTER**) and
  are never written to the DB as base64.

### 3.2 Ingestion progress on the run's stream → `rag/ingest.py`, `rag/models.py`

`IngestRequest` gains `run_id`; `DocumentIngestor` threads it into its `PAGE_CLASSIFIED` and
`DOCUMENT_INGESTED` emits. Today those carry no `run_id`, so they land on `GLOBAL_STREAM` and
`GET /api/runs/{id}/events` never sees them.

This is what makes blocking ingestion acceptable: a 200-page PDF streams 200 `PAGE_CLASSIFIED`
events onto the run's own SSE stream and the intake node renders a live counter. Ingestion
**must** block the run — backgrounding it lets retrieval race ingestion and produce a
confidently ungrounded answer.

### 3.3 Node sequence — intake first

Intake must precede classify, because `has_scanned_pages`, `page_count` and `extracted_chars`
drive the VISION/LONG_CONTEXT deterministic overrides at `classify.py:154-159`.

| ordinal | node_id | kind |
|---|---|---|
| 0 | `intake` | `document_intake` |
| 1 | `classify` | `classify` |
| 2 | `retrieve` | `vector_search` |
| 3 | `execute` | `llm_generate` |
| 4 | `verify` | `sovereignty_guard` |

The intake node is **always** emitted (0 ms, `{"attachments": 0}` when idle) so the frontend
reducer has a stable shape.

> **The one detail that will silently break routing if missed.** `extracted_chars` fed to the
> classifier must be the chars that will *actually enter the prompt*, not the document's full
> length. RAG sends retrieved chunks, not whole documents. A 400 000-char PDF's true length
> estimates to 100 000 tokens, and `filters.py:125` then rejects **every** candidate for
> `CONTEXT_TOO_SMALL`, killing the run with `NoCandidateModels`. Use
> `min(extracted_chars, top_k * chunk_target_tokens * CHARS_PER_TOKEN)` (~8 400 at `top_k=3`).
> `page_count`/`scanned_page_count` stay truthful; only the char estimate is bounded, and that's
> correct because retrieval bounds it in reality.

### 3.4 Scope retrieval to the attachment

`service.py:353` passes no `document_ids`, so uploading a doc and asking about it searches the
whole corpus. Pass the intake's `INDEXED`/`DEDUPED` ids — `QdrantIndex` already implements the
filter (`rag/index.py:224-231`). Lower the threshold from `0.58` to `0.35` when scoped: the
operator explicitly attached this document, so its best chunks at 0.4 are correct, whereas a
corpus-wide 0.4 hit is noise. Record `scope: "attachment" | "corpus"` and the threshold in the
step output so the choice is auditable.

### 3.5 `RunAttachment` reshape + redaction

Add `document_id` (preferred path: pre-upload via the existing multipart endpoint), `sha256`,
`kind`, `extracted_chars`; keep `data_base64` for compat and paste-an-image. Add an `is_image`
property (mime-first) and a `redacted()` dump.

**Redaction is a required fix.** `service.py:627` writes the entire base64 blob into
`runs.attachments`, a JSON column: a 5 MB image becomes ~6.7 MB of JSON per run, `RunRead`
returns it verbatim, and `GET /api/runs?limit=50` serialises up to 50 of them. Store the
redacted dict, updated post-intake with `document_id`/`sha256`/`disposition`/`chunk_count`.
Add a size limit (`settings.rag.max_attachment_mb`, default 25) rejected **before** decode.

### 3.6 Table parsing (real RAG-quality fix)

`BlockType.TABLE` exists and `rag/chunk.py:116,173` has a dedicated "tables stand alone, with
their section heading" path — but `_parse_text` never emits a `TABLE` block. CSV is chunked as
prose and markdown tables aren't detected at all. All three new `samples/*.md` are dense with
wide markdown tables and embedded code, so this is actively degrading retrieval on exactly the
material being demoed. Detect markdown pipe-tables and CSV structure in `parse.py:_parse_text`
and emit `BlockType.TABLE`. This also feeds Phase 6's data-analysis page.

---

## Phase 4 — Delete the mock layer

`fetchWithFallback` (`lib/api.ts:159-185`) silently substitutes mock data on **any** non-OK
response or network error, across ~20 endpoints backed by a 958-line `mockData.ts` (9% of the
frontend). The UI cannot distinguish "backend down" from "500" from "real data".

1. Delete `apps/web/lib/mockData.ts` and every `MOCK_*` import.
2. Rewrite `fetchWithFallback` → `apiFetch<T>()`: throws a typed `ApiError(status, detail, code)`
   parsed from the backend's RFC 7807 `application/problem+json` body.
3. Delete the `mockStatusStore` / `useIsMock` / `setDomainMockStatus` machinery and the
   `MockBadge` component (13 usages).
4. Add a small shared `useApiResource` hook (or adopt TanStack Query, which
   `FRONTEND_SPECIFICATION.md` already prescribes and which is absent from `package.json`) so
   every page gets consistent `loading` / `empty` / `error` states with a retry.
5. Remove the client-side fictions that stand in for backend calls:
   - the **68-line fake router** in `simulateRouting` (`api.ts:449-517`)
   - the **client-side regex reimplementation of the AST guard** (`api.ts:1004-1033`)
   - `triggerEgressProbe` incrementing `sessionBlocksCount`/`sessionEgressDrops` **before** the
     fetch (`api.ts:915-916`), so live counters drift upward on every click
   - the hardcoded `total_vram_mb: 8192` / `used_vram_mb: 5324` reshape inside the **live** path
     of `getModelResidency` (`api.ts:344-345`)
6. Delete the 13 unused client functions (`getSystemHealth`, `ping`, `getModel`, `updateModel`,
   `getRuntime`, `registerRuntime`, `getRoutingPolicy`, `getRoutingCapabilities`,
   `getRunArtifacts`, `cancelRun`, `subscribeToNetworkEvents`, `getSandboxStatus`, `getTool`) —
   or wire them up where a page needs them (`cancelRun` especially: there is no stop button
   anywhere despite a working `POST /api/runs/{id}/cancel`).

### 4.1 `InferenceGraph.tsx` — the worst offender

- **Delete `triggerFallbackCompletion` (`:361-383`).** It fabricates a canned
  "Task evaluated locally on sovereign infrastructure…" reply with `tokens: 185`,
  `latency: '2.1s'` and `isMock: false` when the run **fails or times out**. Replace with a real
  error state carrying the backend's `RUN_FAILED` detail and a retry.
- Delete the hardcoded default candidates (`:83-87`), the model-id→name/score map with literal
  `91.2 / 93.8 / 94.5` (`:236-250`), and the client-side keyword `isVision`/`isCode`/`citations`
  guessing (`:110-149`). All of it comes from the real `MODEL_CANDIDATES` / `MODEL_SELECTED` /
  `TASK_CLASSIFIED` events after Phase 1.
- **Key steps on `node_id`, not array index.** Current ids are `route`/`guard`; backend emits
  `classify`/`retrieve`/`execute`/`verify`, so `stepLatencies['route']` never populates and
  always renders the hardcoded `4.8ms`. There is no `retrieve` step in the graph at all. This
  must land with Phase 3's ordinal shift.
- Add listeners for the 7 dropped event types (`MODEL_CANDIDATES`, `RAG_QUERY`, `RAG_RESULTS`,
  `DOCUMENT_INGESTED`, `PAGE_CLASSIFIED`, `MODEL_LOADING`, `MODEL_READY`) and handle the
  server's `lagged` control frame (`events/sse.py:88-92`), which currently loses events with no
  backfill.
- **StrictMode double-run:** `reactStrictMode: true` + the effect at `:151-392` fires
  `api.createRun` **twice per message** in dev — two server runs, two inferences. Guard with a
  ref or move run creation out of the effect.

### 4.2 `app/page.tsx`

Remove `tokens ?? 185` / `latency ?? '1.8s'` (`:253-254`), the `'Qwen 2.5 VL 72B'` fallback name
(`:475`), `MOCK_SAMPLE_PROMPTS`, and the three fake sample docs in the attach menu (`:711-750`).
Fix **regenerate** (`:569-576`), which sets `pendingPrompt` but never appends a new streaming
placeholder — so `handleToken` discards every token and the run executes invisibly. Wire the
`localSearchEnabled` "Local Vector RAG" toggle (`:66`) to an actual request field, or remove it;
it is currently set and never read. Cancel the in-flight `/routing/simulate` on each keystroke
(280 ms debounce, no abort today).

Also: `TopBar.tsx:8,42` iterates `MOCK_MODELS` directly for the model dropdown — point it at
`api.getModels()`.

---

## Phase 5 — Contract alignment

`lib/types.ts` claims to match `API_REFERENCE.md`; it matches neither the docs nor the Pydantic
models. These are live breakages on a real backend, not cosmetic drift. Fix the **frontend** to
match the backend (the backend shapes are correct and test-pinned by
`tests/integration/test_all_endpoints.py`).

| Frontend expects | Backend returns | Effect today |
|---|---|---|
| `AuditRecord[]` | `AuditEventPage {items,total,limit,offset}` (`api/audit.py:23`) | `/audit` calls `.filter` on an object → crash/blank |
| `NetworkSnapshot {established_connections, nft_drop_count, …}` | `SovereigntySnapshot {connections, nft_counter, app_blocked_total, …}` (`sentinel/ledger.py:68`) | every field name differs; `/network` renders empties and `?? 4` |
| `NetworkRulesetResponse {available, ruleset}` | `PlainTextResponse` / 503 (`api/network.py:82`) | `JSON.stringify` on a string body |
| `ToolSpecification {category, parameters_schema, execution_target}` | `ToolListing {parameters, returns, side_effects, implemented, …}` (`tools/models.py:57`) | `/tools` renders `undefined` |
| `SearchChunk {marker, label, score}` | `RetrievedChunk {chunk_id, dense_score, …}` (`rag/models.py:126`) | citation chips render `undefined` |
| `SelfAuditResult {passed, details[]}` | `{ts, profile, assertions[]}` (`sovereignty/selfaudit.py:49`) | `details?.[0]` always undefined |
| `SandboxPolicy` flat | nested `{image, limits, filesystem, network, security}` | tools page shows `\|\|` defaults |
| `AstGuardResult {valid, violations[]}` | `GuardResponse {accepted, findings[]}` (`api/sandbox.py:32`) | always renders the violations branch |
| `getAvailableRuntimeModels(): string[]` | `list[RuntimeModelInfo]` | datalist renders `[object Object]` |
| `execution_mode: "demo"\|"full"\|"test"` | `ExecutionMode = DEMO\|AGENT` | plain wrong |

Two honesty wins available for free: `ToolListing.implemented` already exists and is `false` for
all 8 tools (every one is an `UnimplementedTool`) — surface it instead of implying they run. And
`GET /api/audit/export` raises `NotImplementedYet`, which `fetchWithFallback` currently swallows
so the UI alerts a fabricated *"Exported signed manifest … (47.8 KB)"* (`audit/page.tsx:51`).

Also fix the stale backend docstrings at `orchestrator/models.py:31-36` and `core/enums.py:92-96`
claiming the agent path "is not implemented yet" — it is.

---

## Phase 6 — The dummy pages

### 6.1 `/multimodal` — implement on the run pipeline

Today: `accept="image/*"`, local preview, **no API call at all**; `detections` hardcoded
(`:33-58`) with absolutely-positioned boxes at literal `left: '38%'` that stay pinned over any
uploaded image; `"Model: Qwen2-VL 72B"` a string literal.

Rebuild as a real vision surface: upload → `POST /api/runs` with the image as a base64
attachment → Phase 1's router forces the vision model on `has_image_input` → stream the answer.

> **Scope correction:** drop the bounding-box overlay. `llava:7b` does not reliably emit
> grounded coordinates, so boxes would be fabrication in a new costume. Replace with a real
> VLM description + follow-up Q&A panel showing the actual model used and measured tokens. If
> localisation is wanted later it needs a detection model, which is a separate piece of work.

### 6.2 `/data-analysis` — implement on parsed tables

Today: 6 hardcoded datapoints, a hardcoded "↑ 342°C Above normal range" pill, and a hand-written
"Automated Anomaly Detection Notice" paragraph.

Depends on **Phase 3.6** (table parsing). Add
`GET /api/knowledge/documents/{id}/table` returning parsed columns/rows for `TABLE` blocks, then
chart real values from a selected ingested CSV/markdown table. Compute the summary stats
client-side from actual rows. No sandbox needed — `DockerSandbox.execute()` is 501 and
`VAJRA_SANDBOX__ENABLED` defaults false, so a code-execution route is not available.

### 6.3 `/analytics` — implement on the event log

Today: `1,482 / 287 / 64 / 18` with fake deltas; tab state changes nothing; time-range selector
inert.

All the source data is already persisted. Add `GET /api/analytics/summary?window=` aggregating
over `runs` and `events`: run counts by status, p50/p95 `duration_ms`, real token totals (after
Phase 1.5), model mix from `models_used`, retrieval hit rate from `RAG_RESULTS`, egress
attempts from `network_events`. `EventRepository` already has `query`/`count`. Make the tabs and
the time range actually drive the query.

### 6.4 `/login` — real local auth

Today: prefilled `admin` / `sovereign2026`, `setTimeout(400)` → redirect, no token, no guard.
Every route is reachable without it. There is **zero** auth scaffolding in the backend.

Keep it proportionate to a single-operator airgapped workbench:

- `OperatorRecord` table (username, `pbkdf2_hmac` salted hash — stdlib, no new dependency),
  seeded on first boot with a generated password printed **once** to the server log.
- `POST /api/auth/login` → opaque session token in an `httpOnly`, `SameSite=Strict` cookie;
  `POST /api/auth/logout`; `GET /api/auth/me`.
- A FastAPI dependency guarding every router except `/api/system/ping` and the auth routes.
- Next.js `middleware.ts` redirecting unauthenticated navigation to `/login`.
- `SideNav.tsx:141` "Sign Out" must call logout, not just `<Link href="/login">`.

### 6.5 `/knowledge/graph` — real, heuristic, and labelled

Today: 9 hardcoded entities and 8 relationships with literal pixel coordinates, a footer claiming
"42 Entities / 118 Relationships / 6 Document Sources" while rendering 9, and "Add to Graph" as
an `alert()`.

Since Phase 4 deletes mocks everywhere else, build it from **real ingested data** rather than
static fiction — it will look just as good and won't contradict the rest:

- `GET /api/knowledge/graph` derives nodes from real `documents` and `chunks`: document nodes,
  section nodes from `ChunkRecord.section_path`, and term nodes from capitalised multi-word
  phrases and identifier patterns (`E-102`, `DC-101`, `R-301`, `TI-301`) — which the sample
  corpus is full of. Edges from co-occurrence within a chunk, weighted by frequency.
- Layout client-side with a small force simulation so it animates, instead of literal coordinates.
- **Label it honestly** — "heuristic term extraction over N indexed documents", with real counts
  in the footer. It is a genuine co-occurrence graph; it is not NER, and the UI shouldn't imply
  it is.

If the extraction turns out too thin on a small corpus, the fallback is a clearly-labelled
"example graph" — but only with a visible label, never presented as live data.

### 6.6 `/workflows` — defer, relabel

837 lines of builder that persists to `localStorage` and fakes Deploy with `setTimeout(600)`.
There is no workflow model, table, or endpoint in the backend at all. Out of scope for this pass.
Relabel as a design-only preview and disable/remove the Deploy button so it stops implying
execution. Plan the engine separately.

Also drop the dead code found along the way: `MonoValue.tsx` (0 imports), `runStreamStore.ts`'s
`loadMockRun`/`simulateStepProgression` (never called), and the shell store's
`gpuUsagePercent`/`vramUsedGb`/`vramTotalGb`/`egressCount`, which `StatusBar` reads but nothing
ever writes — so the status bar permanently reads "5.6 GB / 8.0 GB · GPU: 0%". Either feed them
from `/api/models/residency` or remove them.

---

## Implementation order

Each step leaves the tree green.

| # | Step | Phase | Done |
|---|---|---|---|
| 0 | Write this plan to `docs/`; link from README; correct stale ruff/test claims in `IMPLEMENTATION_STATUS.md` | — | ☑ (plan written; README/status doc correction still open) |
| 1 | `typing.Any` import, ruff to zero, conftest fixture fields, `save_step` | 0 | ☑ |
| 2 | Extract `orchestrator/candidates.py`; delegate from `api/routing.py`; `is_service_model` | 1.1 | ☑ |
| 3 | `extra_input_chars` through classify/engine | 1.2 | ☑ |
| 4 | `dependencies.py` wiring; typed executor constructors | 1.4 | ☑ |
| 5 | **Rewrite classify+route**; real `TASK_CLASSIFIED`/`MODEL_CANDIDATES`/`MODEL_SELECTED`; persist `routing_decision`+`task_spec`; `NoCandidateModels` | 1.3 | ☑ |
| 6 | Token counts, `num_ctx`/`max_output_tokens`, verify verdict, `RAG_QUERY`/`RAG_RESULTS` | 1.5 | ☑ |
| 7 | `store/schema_sync.py` + `auto_migrate` | 2.7 | ☑ |
| 8 | Conversation/message tables + enums | 2.1 | ☑ |
| 9 | `ConversationRepository` | 2.2 | ☑ |
| 10 | `orchestrator/budget.py` (pure, unit-testable) | 2.4 | ☑ |
| 11 | `ConversationService` + contracts + `api/conversations.py` | 2.3, 2.5 | ☑ |
| 12 | `conversation_id` on runs; open/bind/close turn; history precedence | 2.6 | ☑ |
| 13 | Table parsing in `_parse_text` | 3.6 | ☑ |
| 14 | `rag/intake.py`; `IngestRequest.run_id`; sha256 dedupe helpers | 3.1, 3.2 | ☑ |
| 15 | `api/knowledge.py` delegates to intake | 3.1 | ☑ |
| 16 | `RunAttachment` reshape + redaction; `ATTACHMENT_SKIPPED` | 3.5 | ☑ |
| 17 | Intake node at ordinal 0; scoped retrieval | 3.3, 3.4 | ☑ |
| 18 | **Frontend: delete mocks**, `apiFetch` + error states, contract fixes | 4, 5 | ☐ |
| 19 | `InferenceGraph` keyed on `node_id`, real events, no fake completion — **must ship with 17** | 4.1 | ☐ |
| 20 | `conversationId` replaces `history`; upload-then-attach for non-images | 2.6, 3.5 | ☐ |
| 21 | Auth (backend + middleware) | 6.4 | ☐ |
| 22 | analytics endpoint + page; multimodal; data-analysis; graph | 6.1-6.3, 6.5 | ☐ |
| 23 | Workflows relabel; dead-code removal | 6.6 | ☐ |

**Backend status (steps 1-17):** implemented and verified — 89/89 tests passing
(63 pre-existing + 26 new: `test_budget.py`, `test_intake.py`, `test_candidates.py`,
`test_conversations.py`, plus a rewritten `test_vertical_slice.py` agent-failure
test), `ruff check .` clean, app boots and all routers register. Two real
pre-existing bugs were found and fixed along the way, not introduced by this
work: (1) the seeded default routing policy in `core/dependencies.py` used
fields (`condition`/`target`/`priority_offset`) that don't exist on
`RoutingPolicy` — dormant because nothing had called `load_policies()` from the
run path before; (2) `tests/integration/test_vertical_slice.py`'s agent-mode
test asserted the pre-Phase-1 "not implemented" behavior, which the already-
uncommitted diff had already made false before this session started.

---

## Risks

1. **`NoCandidateModels` becomes reachable for the first time.** Today the executor *cannot*
   fail to pick a model — it falls back to a hardcoded `qwen3:8b`. After step 5, a cold Ollama
   or a vision prompt with no vision model pulled fails the run outright. Correct behaviour, but
   a visible regression. The `NODE_FAILED` payload must carry the full per-model rejection list
   so the UI can say "3 models rejected: 2 unhealthy, 1 missing vision", not a bare 500.
2. **Context-window elimination.** `CONTEXT_MARGIN = 1.3` against `num_ctx: 8192` leaves ~6 300
   usable estimate tokens. Get `extracted_chars` wrong (§3.3) and every attachment kills every
   candidate. Highest-probability implementation error in the plan — add a unit test asserting a
   400 000-char indexed document still routes.
3. **Ordinal shift breaks the graph reducer.** Steps 17 and 19 must ship together; keying on
   `node_id` is the durable fix.
4. **`extra="forbid"`** means `history` cannot be removed until the frontend stops sending it.
5. **Blocking ingestion** stretches time-to-first-token to 30-90 s for a large scanned PDF.
   Only acceptable because §3.2 streams `PAGE_CLASSIFIED` onto the run's stream; skip that
   thread-through and the UX is worse than what it replaces.
6. **Deleting the mock layer is a big-bang frontend change.** Every page needs real
   loading/empty/error states in the same pass, or the app looks broken when Ollama is cold.
7. Pre-existing issues worth folding in opportunistically: blocking Qdrant/FastEmbed calls on the
   event loop (`rag/index.py`, `rag/embed.py` — stalls every SSE stream during ingest); a second
   `QdrantIndex` constructed per health check (`api/system.py:65`) contending on the embedded
   store's exclusive lock; `index.py:119` resolving `Path("data/qdrant")` against CWD, which is
   why a second store exists at `apps/api/data/qdrant`.

---

## Verification

**Lint/tests:** `cd apps/api && ruff check . && pytest -v`. Ruff must be zero. Existing 63 tests
must stay green.

**New unit tests**

- `build_candidates` output is byte-identical to the pre-move version for a fixed registry fixture.
- `is_service_model`: `True` for `{embedding: 0.95}`, `False` for `{embedding: 0.9, text: 0.8}`.
- `budget_history`: newest-first retention, `min_turns` honoured, exact `dropped_turns`.
- `extract_features(extra_input_chars=N)` moves `estimated_input_tokens` by exactly `N // 4`.
- `classify_kind`: `.docx` is not an image; a base64 `text/plain` payload is not an image
  (regression test for `or bool(att_data)`).
- `RunAttachment.redacted()` never contains `data_base64`.
- `sync_additive_columns` is idempotent and reports `ManualMigration` for a NOT-NULL-no-default
  column rather than issuing an ALTER.

**New integration tests** (temp DB, real `RouterEngine`, faked runtimes)

- Agent run with no attachments → exactly 5 steps at ordinals 0-4; `run_steps[1].routing_decision`
  carries a real `selected`, `candidates` and `weights`.
- `TASK_CLASSIFIED.intent` is a real `TaskIntent` and varies: "write a python function" → `code`,
  "summarise this" → `summarise`.
- All models unhealthy → `RUN_FAILED` with `code="no_candidate_models"` **and**
  `run_steps[1].status == FAILED` (not left `RUNNING`).
- Same `.txt` attached across two runs → second is `DEDUPED`, `chunk_count == 0`, one
  `documents` row.
- `.docx` attached → `UNSUPPORTED`, `ATTACHMENT_SKIPPED` emitted, run still completes,
  `scope == "corpus"`.
- Indexed `.pdf` attached → retrieve step `document_ids == [id]`, `scope == "attachment"`.
- Conversation: create → 3 runs → 6 messages in ordinal order; assistant rows carry non-null
  `model_id`/`run_id` and dict citations with `chunk_id`.
- Send a deliberately wrong `history` alongside `conversation_id` → it is ignored and
  `history_source == "server"`.
- Cancel mid-stream → assistant message `CANCELLED` with partial content, no `PENDING` row left.

**Manual smoke** (`ollama serve` + `qwen3:8b`, `python -m vajra.main`, `npm run dev`)

- Boot against the existing `data/sqlite/vajra.db`: `conversations`/`messages` created, no
  existing table touched, `PRAGMA journal_mode` still `wal`.
- `POST /api/routing/simulate` before/after step 2 → identical decision modulo excluded
  embedding models.
- Real chat turn: confirm the streamed token count in the UI equals Ollama's `eval_count`, that
  the candidate scores in the graph match `MODEL_CANDIDATES`, and that step latencies are the
  real `duration_ms` (not `6.2/4.8/240/1.8`).
- Attach a sample from `samples/` → `[C1]` markers resolve to chunks of *that* document.
- **Stop Ollama and reload every page** — each must show a real error state with a retry, and
  nowhere may a fabricated answer, token count, or PASS badge appear.
- Confirm `runs.attachments` in SQLite contains no base64 after an image chat.
