import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAccount, signInResult } from "./account";

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(body: unknown, init: ResponseInit = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          headers: { "Content-Type": typeof body === "string" ? "text/html" : "application/json" },
          ...init,
        }),
      ),
    ),
  );
}

describe("fetchAccount", () => {
  it("reads signed-in and signed-out answers", async () => {
    serve({ user: { provider: "google" }, providers: ["github", "google"] });
    expect(await fetchAccount()).toEqual({ status: "signed-in", provider: "google", providers: ["github", "google"] });
    serve({ user: null, providers: ["github", "someday"] });
    expect(await fetchAccount()).toEqual({ status: "signed-out", providers: ["github"] });
  });

  it("is unavailable on previews, in the dev server, offline or with a strange answer", async () => {
    serve({ error: "unavailable" }, { status: 503 });
    expect(await fetchAccount()).toEqual({ status: "unavailable" });
    serve("<!doctype html>"); // Vite's dev server answers every path with the app
    expect(await fetchAccount()).toEqual({ status: "unavailable" });
    serve({ user: { provider: "myspace" }, providers: [] });
    expect(await fetchAccount()).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await fetchAccount()).toEqual({ status: "unavailable" });
  });
});

describe("signInResult", () => {
  it("reads the result the server redirected back with", () => {
    expect(signInResult("?signin=ok")).toBe("ok");
    expect(signInResult("?x=1&signin=cancelled")).toBe("cancelled");
    expect(signInResult("?signin=<script>")).toBeNull();
    expect(signInResult("")).toBeNull();
  });
});
