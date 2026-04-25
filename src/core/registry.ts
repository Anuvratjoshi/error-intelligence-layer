import type { Plugin } from "../types/index.js";

// ─────────────────────────────────────────────
// Plugin registry (module-private store)
// ─────────────────────────────────────────────

const _plugins: Map<string, Plugin> = new Map();

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Register a plugin. If a plugin with the same name already exists it will
 * be replaced (latest registration wins).
 */
export function registerPlugin(plugin: Plugin): void {
  if (!plugin.name || typeof plugin.onAnalyze !== "function") {
    throw new TypeError(
      `Invalid plugin: must have a non-empty "name" and an "onAnalyze" function.`,
    );
  }
  _plugins.set(plugin.name, plugin);
}

/** Remove a previously registered plugin by name. No-op if not found. */
export function unregisterPlugin(name: string): void {
  _plugins.delete(name);
}

/** Remove all registered plugins. Useful in tests. */
export function clearPlugins(): void {
  _plugins.clear();
}

/** Return the ordered list of currently registered plugins. */
export function getPlugins(): Plugin[] {
  return [..._plugins.values()];
}
