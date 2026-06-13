# Inkline

Inkline is a small Medium-style writing app built for learning. It has a vanilla HTML/CSS/JS frontend, a Node HTTP backend, and Postgres persistence through Prisma.

## What is included

- A responsive story feed with search, topic filters, and saved stories.
- Dedicated article URLs like `/stories/:id/:slug`.
- Account creation, sign in, sign out, and cookie-based sessions.
- Author settings with profile and email editing.
- Story creation, editing, and deletion for the signed-in author.
- Draft saving before publishing.
- Paginated feed loading.
- A contenteditable rich text editor with bold, italic, headings, quotes, lists, and links.
- Cover image URLs and local cover image uploads stored under `/uploads`.
- Claps, bookmarks, and reader responses.
- Response deletion by the response author or story author.
- Response hiding/showing by story authors and admins.
- Admin moderation tools for recent responses and stories.
- Postgres full-text search across titles, subtitles, authors, topics, and story bodies.
- Email verification and password reset flows using expiring single-use tokens plus an email delivery adapter.
- Postgres tables, Prisma schema, and Prisma migrations.

## Database setup

Create a `.env` file from `.env.example`, then set `DATABASE_URL`.

For a local Postgres database:

```bash
createdb inkline_prisma_dev
```

```env
DATABASE_URL="postgresql://YOUR_MAC_USER@localhost:5432/inkline_prisma_dev"
DIRECT_URL="postgresql://YOUR_MAC_USER@localhost:5432/inkline_prisma_dev"
```

For Neon, use the pooled connection string for `DATABASE_URL` and the direct connection string for `DIRECT_URL`.

Apply the Prisma migration and seed starter stories:

```bash
npm run migrate
```

If you already have local data in `data/db.json`, import it into Postgres:

```bash
npm run db:import-json
```

## Neon setup

Keep Neon config in a separate local file so you can switch between local Postgres and Neon without editing the same `.env` over and over:

```bash
cp .env.neon.example .env.neon
```

In `.env.neon`, paste the pooled Neon connection string into `DATABASE_URL` and the direct Neon connection string into `DIRECT_URL`.

Then apply migrations to Neon:

```bash
npm run neon:migrate
```

Optionally import your legacy `data/db.json` data into Neon:

```bash
npm run neon:import-json
```

Run the app against Neon:

```bash
npm run start:neon
```

Useful Neon commands:

```bash
npm run neon:status
NEON_ENV_FILE=.env.neon-preview npm run neon:migrate
```

## Run it

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

## Test it

The API test suite creates a temporary local Postgres database by default, applies Prisma migrations, starts the server on a random port, runs the main API flows, and drops the database afterward.

```bash
npm test
```

Use `TEST_DATABASE_URL` if you want to point the tests at your own disposable database instead:

```bash
TEST_DATABASE_URL="postgresql://YOUR_MAC_USER@localhost:5432/inkline_test" npm test
```

Useful database commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Files to study

- `index.html` holds the page structure and dialogs.
- `styles.css` controls layout, responsive behavior, editor styling, and dialog styling.
- `app.js` holds frontend state, rendering, routing, and API calls.
- `server.js` holds the HTTP server, API routes, sanitization, direct Prisma story/auth/comment/upload/profile/admin flows, and the JSON import path for old local data.
- `prisma/schema.prisma` defines the Postgres tables and relationships.
- `prisma/migrations/` contains SQL migrations generated from the Prisma schema.
- `data/db.json` is now legacy local data that can be imported with `npm run db:import-json`.
- `uploads/` is created automatically when a user uploads an image.

## API map

- `GET /api/session`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/request-verification`
- `POST /api/auth/verify-email`
- `POST /api/auth/request-reset`
- `POST /api/auth/reset-password`
- `PUT /api/me`
- `GET /api/me/drafts`
- `POST /api/uploads`
- `GET /api/admin/moderation`
- `POST /api/admin/responses/:responseId/moderate`
- `DELETE /api/admin/responses/:responseId`
- `DELETE /api/admin/stories/:id`
- `GET /api/stories`
- `GET /api/stories/:id`
- `POST /api/stories`
- `PUT /api/stories/:id`
- `DELETE /api/stories/:id`
- `POST /api/stories/:id/clap`
- `POST /api/stories/:id/bookmark`
- `POST /api/stories/:id/responses`
- `DELETE /api/stories/:id/responses/:responseId`
- `POST /api/stories/:id/responses/:responseId/moderate`

## Dev email links

Verification and reset links are generated with production-style token rules. By default, the app shows generated links in the UI during development. To send real email with Resend, set these environment variables before starting the server:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_resend_key
EMAIL_FROM="Inkline <hello@yourdomain.com>"
```

Set `ADMIN_EMAILS` to a comma-separated list to make known accounts admins. The first registered user is also made an admin locally so you can reach the moderation tools.

## Learning path

1. Trace `boot()` in `app.js` to see how the page loads session data and stories.
2. Follow `submitAuth()` into `server.js` to learn how sessions are created.
3. Read `prisma/schema.prisma` to see how users, sessions, stories, responses, bookmarks, claps, uploads, and dev emails map to tables.
4. Read `handleStoryIndexPrisma()`, `handleStoryDetailPrisma()`, and `handleMyDraftsPrisma()` in `server.js` to see direct Prisma story reads.
5. Read `handleRegisterPrisma()`, `handleLoginPrisma()`, and `handleResetPasswordPrisma()` to see direct Prisma auth/session writes.
6. Follow `submitStory()` into `handleCreateStoryPrisma()` and `handleUpdateStoryPrisma()` to see frontend data become persisted Postgres data.
7. Read `handleCreateResponsePrisma()`, `handleDeleteResponsePrisma()`, and `handleModerateResponsePrisma()` to see direct Prisma comment writes.
8. Read `handleUploadPrisma()`, `handleUpdateMePrisma()`, and `handleAdminModerationPrisma()` to see direct Prisma file metadata, profile, and admin flows.
9. Read `importJsonDatabase()` and `writeDb()` in `server.js` to understand how old `data/db.json` records are imported into Postgres tables.
10. Read `findPublishedStoryIdsBySearch()` and the full-text search migration to see how Postgres ranks matching stories.
11. Read `test/api.test.js` to see how the auth, story, upload, response, and moderation flows can be tested through HTTP.
12. Read `validateStoryInput()` to see how drafts and published stories use different validation rules.
13. Use `npm run db:studio` to inspect the database visually while you create stories in the app.

## Next useful features

- Add rate limiting for auth, comments, and uploads.
- Move uploaded images to Supabase Storage, S3, or another object store.
- Add browser-level tests for the writing and reading UI.
- Add CI so `npm test` and `npm run check` run before deployment.
