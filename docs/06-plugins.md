# Plugin System

Plugins hook into the **intelligence stage** of the pipeline, after all built-in analysis is complete. They can add extra data, override suggestions, or change severity.

---

## Registering a plugin

```ts
import { registerPlugin } from "error-intelligence-layer";

registerPlugin({
  name: "my-plugin",
  onAnalyze(error, context) {
    return {
      pluginData: {
        "my-plugin": {
          customTag: "billing-service",
        },
      },
    };
  },
});
```

---

## Plugin interface

```ts
interface Plugin {
  name: string;
  onAnalyze(
    error: AnalyzedError,
    context: PluginContext,
  ): Partial<AnalyzedError>;
}
```

The return value is **shallow-merged** into the final `AnalyzedError`. Plugin data should live under `pluginData[pluginName]` to avoid collisions.

---

## Plugin ordering

Plugins run in registration order. Each receives the **accumulated** result so far, so later plugins can see earlier plugins' data.

---

## Built-in plugins (shipped with the package)

| Plugin           | Description                       |
| ---------------- | --------------------------------- |
| _(none in v0.1)_ | More to be added in future phases |

---

## Example: Sentry breadcrumb plugin

```ts
registerPlugin({
  name: "sentry-bridge",
  onAnalyze(error) {
    Sentry.addBreadcrumb({
      type: "error",
      message: error.message,
      level: error.severity === "critical" ? "fatal" : "error",
    });
    return {};
  },
});
```

---

## Removing a plugin

```ts
import { unregisterPlugin } from "error-intelligence-layer";

unregisterPlugin("my-plugin");
```

---

## Clearing all plugins

```ts
import { clearPlugins } from "error-intelligence-layer";

clearPlugins(); // useful in tests
```
