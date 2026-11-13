// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them. They're
// set with `wrangler secret put` and may be missing (a provider not set up yet),
// hence optional.
interface Env {
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Claude API key for insights (EDU-53). Without it, insights are off. */
  ANTHROPIC_API_KEY?: string;
}
