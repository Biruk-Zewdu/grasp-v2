// Provider-agnostic structured-call contract. The model is a swappable
// instrument: every provider returns typed JSON for a given JSON Schema, or a
// graceful failure (the caller then falls back to template output — zero cost).

export interface ProviderRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>; // strict JSON Schema (additionalProperties:false)
  maxTokens: number;
  cacheSystem?: boolean; // cache the (large, static) system prefix where supported
}

export type ProviderResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface Provider {
  readonly name: string;
  structured<T>(req: ProviderRequest): Promise<ProviderResult<T>>;
}
