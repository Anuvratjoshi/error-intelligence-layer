import type { EILConfig } from "../types/index.js";
import { DEFAULT_CONFIG } from "../constants/index.js";

// ─────────────────────────────────────────────
// Mutable global config (module-private)
// ─────────────────────────────────────────────

let _config: EILConfig = { ...DEFAULT_CONFIG };

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** Read the current global configuration. Returns a frozen snapshot. */
export function getConfig(): Readonly<EILConfig> {
  return Object.freeze({ ..._config });
}

/**
 * Merge partial options into the global configuration.
 * Only the provided keys are changed; everything else is left as-is.
 */
export function configure(partial: Partial<EILConfig>): void {
  _config = { ..._config, ...partial };
}

/** Reset configuration to the built-in defaults. Useful in tests. */
export function resetConfig(): void {
  _config = { ...DEFAULT_CONFIG };
}
