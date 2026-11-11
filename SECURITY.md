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

The app runs entirely in the browser and has no backend, accounts or stored user data. The most relevant
reports are about:

- the deployed site and its security headers (Content Security Policy, permissions),
- the build and CI pipeline, including the GitHub Actions workflows and the deploy to Cloudflare,
- dependencies with known vulnerabilities that affect the app.

## How the project protects itself

- Dependencies are scanned by Trivy and Dependabot. Package versions younger than 3 days aren't installed.
- The code and workflows are analysed by CodeQL. The workflows are also audited by zizmor and actionlint,
  and every action is pinned to a commit SHA.
- Secret scanning with push protection is on.
- `main` only accepts pull requests that pass all of these checks.
