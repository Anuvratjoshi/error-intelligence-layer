# Contributing

## Development setup

```bash
git clone https://github.com/your-org/error-intelligence-layer.git
cd error-intelligence-layer
npm install
npm run dev        # watch build
npm test           # run tests
npm run typecheck  # type-check only
```

## Build phases

Work is split into phases to avoid large single-session changes:

| Phase | Folder(s)                                             | Status  |
| ----- | ----------------------------------------------------- | ------- |
| 1     | Scaffolding (`package.json`, `tsconfig`, folder tree) | ✅ Done |
| 2     | `src/types/`, `src/constants/`                        | ⬜      |
| 3     | `src/layers/normalization/`                           | ⬜      |
| 4     | `src/layers/parsing/`                                 | ⬜      |
| 5     | `src/layers/extraction/`                              | ⬜      |
| 6     | `src/layers/enrichment/`                              | ⬜      |
| 7     | `src/layers/intelligence/`                            | ⬜      |
| 8     | `src/layers/formatting/`                              | ⬜      |
| 9     | `src/core/`                                           | ⬜      |
| 10    | `src/index.ts` (public API)                           | ⬜      |
| 11    | `src/plugins/`                                        | ⬜      |
| 12    | `src/adapters/`                                       | ⬜      |
| 13    | `tests/`                                              | ⬜      |

## Code conventions

- No `any` in library code — use `unknown` and narrow it
- Pure functions only in layers — no side effects
- Every new public export must be documented in `docs/03-api-reference.md`
- Every new type must be documented in `docs/04-types.md`

## Testing

```bash
npm test                # run all tests once
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

Tests live in `tests/` mirroring `src/` structure:

```
tests/
├── layers/
│   ├── normalization.test.ts
│   ├── parsing.test.ts
│   └── ...
├── core/
│   └── pipeline.test.ts
└── index.test.ts
```
