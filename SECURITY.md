# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, how to reproduce it, and what an attacker could do with it.

You can expect a first reply within 7 days. Once the issue is confirmed, a fix is prepared in a private
fork and released, and the advisory is published with credit to you, unless you'd rather stay anonymous.

## Supported versions

Only the version deployed from `main` is supported. Fixes are released there, not backported.

## Scope

The app runs in the browser, with a small backend on Cloudflare Workers (`worker/`) and a D1 database. People
can sign in with GitHub or Google; the backend then stores their provider account number, name and profile
picture link, sessions (as hashes) and synced practice history. See the privacy page (`public/privacy.html`)
for exactly what's stored. The most relevant reports are about:

- sign-in and sessions: the OAuth flow (state, PKCE), session cookies, anything that lets one person act as
  or read another,
- access to stored data: one account reading, changing or deleting another's history, or getting around the
  storage and rate limits,
- the deployed site and its security headers (Content Security Policy, permissions),
- the build and CI pipeline, including the GitHub Actions workflows and the deploy to Cloudflare,
- dependencies with known vulnerabilities that affect the app.

## How the project protects itself

- Dependencies are scanned by Trivy and Dependabot. Package versions younger than 3 days aren't installed.
- The code and workflows are analyzed by CodeQL. The workflows are also audited by zizmor and actionlint,
  and every action is pinned to a commit SHA.
- Secret scanning with push protection is on.
- `main` only accepts pull requests that pass all of these checks.
- The API answers only on the production origin (previews get 503), state-changing requests must carry the
  app's `Origin`, session cookies are `__Host-`, HttpOnly, Secure and SameSite=Lax, and only hashes of
  session tokens are stored. Sign-in attempts are rate limited per IP address and sync calls per account;
  each account's synced history has a size limit.
