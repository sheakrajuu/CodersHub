# CodersHub

A self-hosted personal hub for experiences, web finds, videos, pictures, journals, and links.

## Running locally

```bash
npm install
ADMIN_PASSWORD=yourpassword npm start
```

Then open http://localhost:3000. Use **Manage hub** in the footer to sign in as admin.

## Installing as an app

CodersHub is a progressive web app. Open it in a supported browser and choose **Install app** when the
install button appears. On iPhone or iPad, use the browser's **Add to Home Screen** action. The app shell
and the latest public content response are cached so the workspace can reopen when temporarily offline.

## Deploying on Render

1. Push this folder, including `render.yaml`, to a GitHub repo.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render will use `render.yaml` to create the CodersHub web service.
4. Add the values for the environment variables marked `sync: false`:
  - `ADMIN_PASSWORD` — required only on the first start. Use 12+ characters with uppercase, lowercase, a number, and a symbol. It is hashed into `data/admin-auth.json`; change it later from the admin panel's Security tab.
  - `ADMIN_PASSWORD_RESET` — optional one-time recovery flag. Set it to `true` together with a new `ADMIN_PASSWORD` if the admin password is forgotten, sign in once, then remove the flag and redeploy.
  - `PEXELS_API_KEY` — optional, enables the Pexels picture search tool.
  - `YOUTUBE_API_KEY` — optional, enables the YouTube video search tool.
5. Deploy. Render gives you a URL for your CodersHub site.

## How content storage works

Content (pictures, videos, blog posts, links) is stored in `data/content.json` on the server —
not in the visitor's browser — so everything you add in the admin panel is visible to every visitor.

One thing to know about Render's **free** tier: its disk is not persistent across deploys/restarts,
so `data/content.json` can reset when the service restarts. If you want content to survive restarts:
- Upgrade to a Render plan with a persistent disk and mount it at `/data`, then point `DATA_FILE`
  at that path (small code change in `server.js`), **or**
- Swap the JSON file for a real database later (Render's free Postgres works well) — ask me if you
  want that done.

## Adding content

- **Embed video**: paste a Vimeo or YouTube link (or a full `<iframe>` embed code) — CodersHub figures out
  how to play it.
- **Add pictures**: paste one image URL, or several separated by new lines or commas, to add them all
  at once.
- **Write post**: title + body, published immediately.
- **Add link**: URL, title, and an optional description — shown to visitors as a card with a "Visit" button.
- **AI fetch**: search Pexels for pictures or YouTube for videos by keyword, preview the results, and
  add the ones you want with one click. Needs the optional API keys above.

## Admin access

There's a single admin login — no visitor accounts, since only you manage content. Change the password any
time from the Security tab in the admin panel.
