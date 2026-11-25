// What the ordering Worker is given by Cloudflare: bindings from wrangler.jsonc and secrets
// (set with `wrangler secret put`, or in .dev.vars locally). Minimal types, so no extra package is needed.

export interface Env {
  /** The built static site in dist/. */
  ASSETS: { fetch(request: Request | string): Promise<Response> };
  DB: D1Database;
  STOREFRONT_API_URL: string;
  RESTAURANT_ID: string;
  /** "true" sends each paid order to the POS so it reaches the kitchen. */
  POS_FORWARD?: string;
  /** The payment_method the POS records for orders already paid online. */
  POS_PAYMENT_METHOD?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** "true" fakes payments when there are no Stripe keys. Only ever set in .dev.vars. */
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
