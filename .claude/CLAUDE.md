# Retearn CMS Portal — Project Context

Read this file fully before writing any code. It is the single source of truth for this project. Where it conflicts with anything else (old comments, half-built code, your own assumptions), this file wins.

## 0. What this project is

Retearn's internal documentation lives in an unstructured Google Drive: no enforced hierarchy, no real access control, no audit trail, no version history, finding anything requires tribal knowledge. This project replaces that with a purpose-built internal CMS.

Core goals, in priority order:
1. **Information consolidation** — one system of record instead of scattered folders
2. **Structured navigation** — browse by Team or by Product, not by nested folders
3. **Universal search**
4. **RBAC** — permissions attached to roles, not individual users
5. **Approval workflow** — every upload lands in Pending until an Admin approves or rejects it
6. **View-only enforcement** — documents are viewable in-browser but not downloadable
7. **Version history** — every re-upload creates a new version, old versions recoverable

We evaluated SVN, Confluence, SharePoint, Notion, and M-Files before deciding to build in-house. Reasoning: no SaaS tool fully enforces view-only (files are always downloadable), none offer a true custom role editor without costly plugins, and SaaS pricing scales with headcount while an AWS-native build scales with usage instead (~$500–900/yr at 300 users vs. $16.5K–234K/yr depending on tool). We borrow specific concepts from SVN (revision numbering, locking during review, atomic uploads, metadata tagging) and Confluence (spaces → Team/Product containers, labels → tags, page versioning, draft/published states) rather than adopting either tool directly.

## 1. Current status — READ THIS FIRST

**We are building an MVP for a hard deadline: working demo by Tuesday, and it is currently early in that week.**

What exists today:
- A **static, in-memory HTML/JS prototype** (`recykal_cms_phase1_demo.html`) — this is a UI/flow demonstration only. It has mock TEAMS/PRODUCTS arrays, mock DOCS with hardcoded team[]/product[] tags, a role-select dropdown that fakes RBAC client-side, a fake approvals queue, and a document viewer modal. **None of it is wired to a real backend.** No auth, no database, no S3, no persistence. Do not present this as "Phase 1 done" — it's a wireframe that happens to be built in HTML instead of Figma.
- No backend, no database, no deployed infrastructure yet.

**What we're doing now:** taking the navigation/interaction patterns validated in that prototype and rebuilding them against a real Express + Postgres stack (storage is local disk in Phase 1, migrating to S3 later — see §11), on a compressed timeline. This means the full long-term spec (data-driven roles, location as a nav dimension) is **intentionally cut down** for the MVP — see §13. Build the MVP first. The full-spec items are documented in §15 so they aren't lost, not because they're in scope this week.

If you (Claude Code) are picking this up mid-build, check `git log` and the actual repo state before assuming anything below is unbuilt — this file describes the target, not necessarily current progress.

## 2. Locked decisions — do not re-litigate these

These were open questions in earlier design passes and have since been decided specifically to keep the MVP buildable in the time available. Follow them without asking for reconfirmation.

| Decision | Locked call | Why |
|---|---|---|
| Auth | **Google OAuth (Workspace SSO), JWT** — sign-in restricted to `@recykal.com` accounts only | Retearn already runs Google Workspace, so this is zero-friction SSO with no passwords to manage or reset. We only ever read name + email from Google — no password storage, no registration flow. Domain restriction is enforced both in the Google consent flow (`hd` param) and re-checked server-side on every token exchange, since the client-side hint alone is not trustworthy. |
| Backend framework | **Plain Express** (not a serverless/Lambda-first flavor) | Keeps things simple to build and debug locally now; staying framework-agnostic protects the later Lambda migration. |
| Location as a nav level | **No — deferred to v2.** Product/Team toggle only in v1. | Cuts a whole navigation dimension out of MVP scope. If it appears at all, it's a metadata tag, not a browsable level. |
| Role model | **Hardcoded enum, 3 tiers**: `Super Admin`, `Admin`, `User`, enforced via middleware | This matches the original actor model (Super Admin assigns Admins; Admin approves/rejects and manages categories; User views + uploads pending-review docs) — not the 4-role Admin/Editor/Approver/Viewer split floated in an earlier pass. There is no separate Editor or Approver role: any User can upload, and any Admin can approve/reject. A fully data-driven `roles/permissions/role_permissions` schema is the correct long-term design (see §15) but a role-editor UI is not survivable to build this week. |
| Document ownership across Team/Product modes | **Optional single owning team + many-to-many product tags**, via join tables. At least one tag (team or product) is required; a doc can be product-only (e.g. an "Ace PRD" with no team). | Revised mid-build: an earlier pass made the owning team mandatory, but that couldn't represent a product-only doc. Team is now a single optional tag (pick zero or one), consistent with §4's original "at least one tag" rule — it just wasn't being enforced that way yet. Products remain many-to-many. |
| Category cardinality | **Many-to-many**, via a join table (`DocumentCategory`), not a single `categoryId` | Revised mid-build: categories are tags too ("Research," "PRD," etc.), same shape as product tags, not a single forced classification. A document can carry several. Rendered as colored tag chips (deterministic per-name color), not a dropdown. |
| Approval requirement for Admin/Super Admin uploads | **Auto-published, no review step** | An Admin/Super Admin is already the approver — routing their own upload through their own approval queue is pointless ceremony. Only `USER` uploads land in `Pending`. |
| Document storage (Phase 1) | **Local disk**, behind a small storage adapter (`save` / `getSignedUrl` / `delete`) with the same signed-URL contract S3 will use | Revised mid-build: S3 needs an AWS account or credentials the team didn't have on day one. The adapter boundary means swapping in a real S3 adapter later is a new adapter file + an env var, not a rewrite — see §11. |

## 3. Tech stack

- **Frontend:** React via Next.js (App Router)
- **Backend:** Node.js / Express (plain — no NestJS/Fastify, see §2)
- **Database:** PostgreSQL, accessed via Prisma ORM
- **Storage:** Local disk in Phase 1 behind a storage adapter, migrating to AWS S3 later — signed URLs for all document access either way (view-only enforcement — never issue a direct/public URL); see §11
- **Auth:** Google OAuth (`@recykal.com` only) for identity + our own JWT for authorization, stateless so the backend can scale horizontally later — see §2, §10
- **Version control:** GitLab
- **Hosting (MVP / Phase 1):** Vercel (frontend) + Railway or Render (backend + managed Postgres). GitLab Pages is static-only and cannot host the Express backend — don't route hosting through it.
- **Hosting (later):** migrate backend to AWS EC2/Lambda, ap-south-1 (Mumbai)
- **Logging:** structured JSON logs (Winston) feeding the audit trail

## 4. Navigation & information architecture

Entry point is a **Team / Product toggle**, not a folder tree.

- **Level 1 — mode toggle:** Team or Product
- **Level 2 — entity selection:** a **searchable sidebar list** (not tabs — tabs stop scaling past ~6 items). Team mode lists teams (AI, Marketing, Embedded, Software, QA, Ops, ...); Product mode lists products (Pro, Ace, Go, Fastscan, ...)
- **Level 3 — category filter:** **filter chips**, not subfolders (e.g. Model Results, Datasets, Research, Schemes, PRD, Brand, Campaigns, Other). Chips allow a document to belong to multiple categories without forcing single-location ownership; folders would break that.

A document can appear under multiple entities (its owning team, plus any tagged products) — when it does, the UI shows an **"Also in: [X]"** badge that jumps the user to that other context. This is already implemented in the prototype's `renderGrid()` / `docTagsForEntity()` logic — port the pattern, don't redesign it.

"Uncategorized" is a **scoped fallback within each team or product**, not a third global navigation mode. Every upload requires at least one tag (team or product) at minimum.

This tag-based model was weighed against a straight **Folder Method** (toggle → click into entity → click into folder → files inside that folder only, closer to classic Drive navigation). Folder Method was rejected: it's more familiar but forces a document into exactly one location, which breaks the "one file, multiple contexts" requirement (see §5). The tag-based model is the locked call — don't reintroduce folder-only navigation.

## 5. Document model

- A document is either an **uploaded file** (stored once via the storage adapter — local disk in Phase 1, S3 later) or a **link to an externally-hosted doc** (e.g. a Google Drive file) — `sourceType` is `FILE` or `LINK`. For a `LINK` doc we store the URL only; view-only enforcement for it is Drive's own share permissions (set the share to viewer-only), not something this app enforces.
- A `FILE` document's title is always the uploaded filename — there's no separate title field to type or let drift from it. A `LINK` document needs a manually-entered title since there's no filename to derive one from.
- Documents are tagged many-to-many against Teams, Products, **and Categories**, each via its own join table — never duplicate the file for a second tag. Team is a single optional tag (0 or 1); Product and Category are true many-to-many (0 or more).
- At least one of {owning team, a product tag} is required at upload time; at least one category tag is also required.
- Every re-upload creates a new version row; the file itself is versioned in S3 too (bucket versioning) once we're on S3, as a second layer of recoverability.
- Soft delete only: a `status` flag + `deleted_at` timestamp. Never hard-delete a row or the underlying file from the app layer.

## 6. RBAC (MVP version — see §15 for the long-term design)

This is Retearn CMS's RBAC: three actors — **Super Admin**, **Admin**, **User** — with permissions attached to the role, not to individual accounts. That's the whole definition of RBAC (assign permissions to roles, assign roles to users), so don't build anything more elaborate than the enum + middleware described below for the MVP.

**Three hardcoded roles, not four.** An earlier pass floated an Admin/Editor/Approver/Viewer split — that's wrong, discard it. The correct model, per the original actor definitions, is:

| Role | Can do |
|---|---|
| **Super Admin** | A single bootstrap account. Creates and manages Admin accounts (promote/demote a User to Admin). Otherwise has every Admin permission below. |
| **Admin** | Approve or reject pending documents. Create/manage Teams, Products, and Categories. View the audit log. Cannot create other Admins — that's Super Admin only. |
| **User** | Browse, search, and view documents (signed URL, no download). Upload documents and new versions — every upload lands in `Pending` status until an Admin approves or rejects it. |

There is **no separate Editor or Approver role.** Any User can upload; any Admin (or the Super Admin) can approve/reject. This is deliberately simpler than the 4-role version to keep middleware and seed data minimal for the deadline.

Do not build a role-management UI beyond a single Super-Admin-only screen (or even just a seeded script) for promoting a User to Admin. Roles are an enum in the schema; permissions are enforced in middleware, not looked up from a database table.

## 7. Document lifecycle

`Pending → Published` or `Pending → Rejected`

There's no separate "save as draft, then submit" step — with only User/Admin roles, that extra state doesn't earn its complexity.

- User uploads a document (or a new version of an existing one) → status `Pending` immediately.
- **Admin or Super Admin uploads (or pushes a version) → status `Published` immediately, no review step.** They're already the approver, so routing their own upload through their own queue is pointless. This is the one exception to the Pending-first rule.
- Admin (or Super Admin) reviews a `USER`-submitted document:
  - Approve → status `Published`, that version becomes the current visible version.
  - Reject → status `Rejected`, with a note. The User can re-upload a new version, which resets status to `Pending`.
- Every status transition (including auto-publish) writes an audit log row (who, what, when).
- A document under `Pending` is soft-locked — no new version can be pushed until the current review resolves (borrowed from SVN's locking concept, kept from the earlier pass since it's still a good idea).

## 8. Database schema (Prisma-style, MVP scope)

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  USER
}

enum DocStatus {
  PENDING
  PUBLISHED
  REJECTED
}

enum DocSourceType {
  FILE // stored via the storage adapter (local disk today, S3 later)
  LINK // points at an externally-hosted doc (e.g. Google Drive) — we store the URL only
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique   // verified @recykal.com address from Google
  name         String
  role         Role
  createdAt    DateTime @default(now())
  documents    Document[] @relation("UploadedBy")
  auditLogs    AuditLog[]
}

model Team {
  id        String   @id @default(uuid())
  name      String   @unique
  documents Document[] @relation("OwningTeam")
}

model Product {
  id        String            @id @default(uuid())
  name      String            @unique
  documents DocumentProduct[]
}

model Category {
  id        String             @id @default(uuid())
  name      String
  scope     String // team id or product id this category is scoped to
  documents DocumentCategory[]
  @@unique([name, scope])
}

model Document {
  id             String             @id @default(uuid())
  title          String
  status         DocStatus          @default(PENDING)
  rejectionNote  String?
  ownerTeamId    String? // optional — a doc needs at least one tag (team or product), not necessarily a team
  ownerTeam      Team?              @relation("OwningTeam", fields: [ownerTeamId], references: [id])
  uploadedById   String
  uploadedBy     User               @relation("UploadedBy", fields: [uploadedById], references: [id])
  currentVersion Int                @default(1)
  sourceType     DocSourceType      @default(FILE)
  s3Key          String? // current version's storage key — set when sourceType = FILE
  externalUrl    String? // current version's external link — set when sourceType = LINK
  deletedAt      DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  products       DocumentProduct[]
  categories     DocumentCategory[]
  versions       DocumentVersion[]
}

model DocumentProduct {
  documentId String
  productId  String
  document   Document @relation(fields: [documentId], references: [id])
  product    Product  @relation(fields: [productId], references: [id])
  @@id([documentId, productId])
}

model DocumentCategory {
  documentId String
  categoryId String
  document   Document @relation(fields: [documentId], references: [id])
  category   Category @relation(fields: [categoryId], references: [id])
  @@id([documentId, categoryId])
}

model DocumentVersion {
  id          String        @id @default(uuid())
  documentId  String
  document    Document      @relation(fields: [documentId], references: [id])
  version     Int
  sourceType  DocSourceType @default(FILE)
  s3Key       String?
  externalUrl String?
  note        String?
  uploadedBy  String
  createdAt   DateTime      @default(now())
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String   // e.g. "upload", "approve", "reject", "view", "delete"
  targetId  String   // document id (or other entity) affected
  metadata  Json?
  createdAt DateTime @default(now())
}
```

Note: `Team` and `Product` are flat lookup tables for the MVP — no `Location` table (deferred, see §11).

## 9. API surface (MVP)

```
POST   /api/auth/google           (exchanges a Google ID token for our JWT; verifies @recykal.com domain server-side, auto-provisions User on first login)
GET    /api/auth/me

GET    /api/teams
GET    /api/products
GET    /api/categories?scope=<teamId|productId>
POST   /api/teams                (admin only — Admin or Super Admin)
POST   /api/products              (admin only)
POST   /api/categories            (admin only)

PATCH  /api/users/:id/role        (super admin only — promote/demote a User to Admin)

GET    /api/documents?mode=team|product&entityId=<id>&category=<id>&q=<search>&status=<pending|published|rejected>&modifiedSince=<date>
GET    /api/documents/:id
POST   /api/documents             (any authenticated user — file upload (multipart) or a Drive-style link (JSON); body:
                                    { ownerTeamId?, productIds[], categoryIds[] (>=1 required, >=1 of ownerTeamId/productIds required),
                                      sourceType: FILE|LINK, file | (title + externalUrl) }
                                    -> creates Document + v1 DocumentVersion. status PENDING for a USER upload,
                                    PUBLISHED immediately (no review) if the uploader is ADMIN/SUPER_ADMIN — see §7.)
POST   /api/documents/:id/versions (uploader or admin — new version upload, same auto-publish-if-admin rule, soft-locked while PENDING)
PATCH  /api/documents/:id/approve  (admin only -> status PUBLISHED, only from PENDING)
PATCH  /api/documents/:id/reject   (admin only -> status REJECTED, note, only from PENDING)
DELETE /api/documents/:id          (soft delete — admin only)

GET    /api/documents/:id/view-url  -> { url, sourceType, expiresIn }
                                        # FILE: a signed, short-lived link (local-disk HMAC signature today, S3 presigned URL later)
                                        # LINK: the stored external URL itself, expiresIn null — Drive's own share permissions are the enforcement

GET    /api/search?q=<term>         # ILIKE across title + category + tags for MVP — do not build full-text search yet

GET    /api/audit-log               (admin only)
```

Search is deliberately simple (`ILIKE`) for the MVP. M-Files-style metadata-first search is a good v2 idea, not this week's problem. The `status` and `modifiedSince` query params on the document list endpoint are cheap (plain `WHERE` clauses, not a search feature) — include them, they're the SharePoint-style column-filter behavior worth having even in the MVP.

## 10. Auth flow (MVP)

1. User clicks "Sign in with Google" → Google Identity Services flow, scoped to `@recykal.com` (via the `hd` hint) → returns a Google ID token containing name + email. No password ever touches our system, and there is no separate registration screen.
2. Backend verifies the ID token against Google's public keys and rejects anything where the email domain isn't exactly `recykal.com`, even if the client-side `hd` hint was bypassed.
3. First successful sign-in auto-provisions a `User` row (email, name, default role `USER`); returning users are matched by email. The one `SUPER_ADMIN` account is seeded/promoted directly in the database (never self-assigned via Google), and it promotes others to `ADMIN` via `PATCH /api/users/:id/role`.
4. Backend issues its own short-lived JWT with `{ userId, role }` claims (role is one of `SUPER_ADMIN` / `ADMIN` / `USER`) — Google only proves identity, our JWT still drives authorization, so §9's protected routes and middleware are otherwise unchanged. Refresh not required for MVP (accept re-login on expiry).
5. Every protected route reads our JWT, attaches `req.user`, and role-checks via middleware before the handler runs.
6. Frontend gates UI elements (upload button, approvals queue, admin panel) off the decoded role claim — same pattern already stubbed in the prototype's `applyRoleVisibility()`, but driven by a real JWT instead of a dropdown. Note: the prototype's dropdown was built around the old 4-role terms (admin/editor/approver/viewer) — collapse that to `SUPER_ADMIN`/`ADMIN`/`USER` when porting, don't carry the old role names into real code.

## 11. Storage & view-only enforcement

**Phase 1 (current): local disk, not S3 yet.** No AWS account was available on day one, so `backend/src/lib/storage.ts` implements the same three-method contract (`save`, `getSignedUrl`, `delete`) against the local filesystem instead. Signed URLs are HMAC-signed with a short expiry (`FILE_URL_SECRET`, 5 min TTL) and served through a dedicated `GET /files?key=&expires=&sig=` route with `Content-Disposition: inline` — same behavior as an S3 presigned URL, just backed by disk. **Migrating to S3 later means writing one new adapter implementing the same three methods and flipping an env var — routes, the schema, and the frontend don't change.**

- Storage key structure: `{documentId}/{version}/{filename}` (no team prefix — a doc's owning team is optional, see §2, so the key can't depend on it).
- The app **never** returns a public or permanent URL for a `FILE` doc. All access goes through `GET /api/documents/:id/view-url`, which returns a short-expiry signed URL. A `LINK` doc's view-url is just the stored Drive URL — no signing needed, since Drive enforces its own access control.
- Frontend opens the signed/external URL in a new tab rather than an embedded viewer for now; `Content-Disposition: inline` keeps the local-disk case view-only-ish in-browser (a real in-browser PDF/image viewer is a nice-to-have, not yet built).
- **When we do move to S3:** bucket structure `s3://retearn-cms/{documentId}/{version}/{filename}`, bucket versioning enabled as a second recoverability layer behind `DocumentVersion`, signed URLs scoped to `GetObject` only, IAM credentials least-privilege and scoped to this bucket only.

## 12. Frontend reference

`recykal_cms_phase1_demo.html` (already in the repo/uploads) is the validated UI reference for:
- Team/Product toggle + sidebar + chip layout
- Grid rendering with status pills — rename the states to `pending` / `published` / `rejected` when porting, they were `draft`/`in_review`/`approved` in the prototype
- "Also in:" cross-tag badge + jump behavior
- Document viewer modal (version history side panel)
- Approvals queue page, gated by role
- Upload modal with tag picker

Port these interaction patterns into real Next.js components wired to the API in §9 — don't redesign the UX from scratch. Known gaps flagged from the last prototype review, worth fixing on the real build: timestamps should show relative time ("2 days ago") not absolute dates; column sort should be interactive with the caret already drawn in; the avatar dropdown's contents still need to be explicitly specified rather than assumed.

## 13. MVP scope — ship this, nothing more

**In scope for the deadline:**
- Auth (Google OAuth restricted to `@recykal.com`, JWT) + 3 hardcoded roles (Super Admin, Admin, User) with middleware gating
- Team/Product toggle, sidebar, category chips — wired to real data (replace the prototype's mock arrays with API calls)
- Upload with many-to-many tagging (team/product/category) → local disk storage (§11), S3 migration deferred until AWS access exists
- View-only enforcement via signed URLs
- Pending → Published/Rejected lifecycle, Admin approval actions
- Version increment on re-upload
- Basic search (ILIKE across title + tags), plus simple status/date filters on the document list endpoint
- Audit log (write-only table; a full UI for it is optional/nice-to-have)
- Soft delete

**Explicitly deferred — do not build these now, and this has been communicated to stakeholders already:**
- Data-driven role/permission editor (§15) — roles stay hardcoded; if a granular Editor/Approver split turns out to be needed later, it's a role addition, not a rearchitecture
- Location as a navigation level
- AWS Lambda/EC2 migration
- Nightly purge job for soft-deleted records
- Full-text/metadata-first search, "recently edited" indicators, column-based metadata filtering beyond status/date

If you're tempted to "just quickly" build one of the deferred items because it seems easy — don't. Scope creep here is the single biggest risk to the deadline, not technical difficulty.

## 14. Non-functional requirements

- Desktop-first, must be usable on mobile (not necessarily optimized).
- Stateless backend (JWT, no server-side session) so it can scale horizontally later.
- Structured JSON logs (Winston) for the audit trail.
- Least-privilege IAM on S3 credentials.
- Secrets out of git — `.env` gitignored; move to Secrets Manager/SSM only once actually deployed to AWS.

## 15. Post-MVP roadmap (v1.5 / v2 — for context only, not this build)

- **Data-driven RBAC:** replace the hardcoded `Role` enum with `roles / permissions / role_permissions` tables so roles are admin-editable without a code change — and only then consider splitting Admin into a separate Editor/Approver pair if real usage shows the combined Admin role is a bottleneck. The API route shape in §9 is deliberately designed so this migration doesn't require reworking endpoints, just the middleware's permission-lookup logic.
- Admin-approval gate for brand-new Google sign-ups — currently any verified `@recykal.com` account auto-provisions as `USER` on first login; requiring an Admin to activate new accounts before they can browse is a v2 hardening step.
- **Location** (Goa / TTD / Kerala / UK) as a real navigable dimension, not just a tag.
- Migrate backend hosting from Railway/Render to AWS EC2 or Lambda, ap-south-1.
- Full-text / metadata-first search (M-Files-style), indexing inside PDFs/DOCX, not just filenames and tags.
- SharePoint-inspired UI polish: a "recently edited" indicator, column-based metadata filtering (product/team/status/date) as a first-class filter panel rather than just query params, richer version-history comparisons (side-by-side diff).
- Redis caching layer for the nav tree and sessions if traffic warrants it.

## 16. How to work in this repo

- Work phase by phase against §13, not the whole spec at once — smaller diffs, easier to verify.
- If a requirement here seems to conflict with something already in the codebase, flag it rather than silently picking one — this file may be ahead of or behind actual repo state depending on when it was last synced.
- Test the S3 signed-URL round trip in isolation before wiring it into the upload/view flow — it's the highest-risk integration point on the timeline.
- Don't relitigate the decisions in §2 mid-build.
