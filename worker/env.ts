// What the ordering Worker is given by Cloudflare: bindings and vars from wrangler.jsonc (or .dev.vars locally).
// There are no secrets: card payments use the POS's Stripe account, set up in the POS admin.
// Minimal types, so no extra package is needed.

export interface Env {
  /** The built static site in dist/. */
  ASSETS: { fetch(request: Request | string): Promise<Response> };
  DB: D1Database;
  STOREFRONT_API_URL: string;
  RESTAURANT_ID: string;
  /** "true" fakes payments and keeps orders out of the POS, for local testing. Only ever set in .dev.vars. */
  MOCK_PAYMENTS?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
