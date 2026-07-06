# GraphQL Profile

**Live demo: https://jakisheff.github.io/graphql/**

A personal profile dashboard for the [01 Tomorrow School](https://01.tomorrow-school.ai) platform, built by querying its GraphQL API. Plain HTML/CSS/JS — no framework, no build step. All graphs are hand-built SVG.

## Features

- **Login page** — works with both `username:password` and `email:password` via Basic auth against `/api/auth/signin`; shows a clear error on invalid credentials, and has a log out button.
- **JWT auth** — the token is stored locally, decoded to find the user id, and sent as `Bearer` auth with every GraphQL request.
- **Profile sections** — identity, total XP, audit ratio (done vs. received), and projects passed.
- **Statistics (SVG)**:
  - XP progress over time (interactive step/area chart with hover tooltip)
  - XP earned by project (bar chart)
  - Audit ratio (donut)
  - Projects pass/fail ratio (donut)
  - Best skills (bar chart, when available)

## GraphQL usage

All three required query styles are used (see `js/app.js`):

| Style | Query |
|---|---|
| Normal | `user { id login … }` |
| With arguments | `transaction(where: {type: {_eq: $type}}, order_by: …)` |
| Nested | `progress { object { name type } user { login } }` |

## Run locally

Any static file server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(A plain `file://` open won't work because the app uses ES modules.)

## Hosting

The site is fully static, so any static host works:

Hosted on **GitHub Pages** at https://jakisheff.github.io/graphql/ (deployed from the `main` branch of [Jakisheff/graphql](https://github.com/Jakisheff/graphql), root folder). Any other static host (e.g. Netlify) works the same way: no build command, publish directory = repo root.

## GraphiQL

The profile embeds its own GraphiQL IDE at [graphiql.html](graphiql.html) (linked from the top bar once signed in). It reuses your session's JWT as Bearer auth, so you can explore the schema and run queries against your own data.

## Project structure

```
index.html      login + profile views
css/style.css   styling
js/api.js       signin, JWT handling, GraphQL client
js/charts.js    SVG chart builders (line/area, bars, donut)
js/app.js       queries, data shaping, rendering
```
