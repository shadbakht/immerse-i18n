# @immerse/i18n

UI strings for [Immerse](https://immerseresearch.app), shared by the mobile app
and the web app so a term is translated once rather than twice.

Interface strings only. Scripture is content and lives in the corpus — never here.

## Consumers

| Repo | Visibility | Installs via |
|------|-----------|--------------|
| `shadbakht/ImmerseResearch` (mobile) | private | `github:shadbakht/immerse-i18n#vX.Y.Z` |
| `shadbakht/immerse-web` | public | `github:shadbakht/immerse-i18n#vX.Y.Z` |

This repo is public so Vercel can install it during `immerse-web` builds without
a deploy token. Nothing here is sensitive: `immerse-web` is itself public, so
these strings already ship to anyone who reads the client bundle.

## Usage

```ts
import { translate, SUPPORTED_UI_LANGUAGES } from '@immerse/i18n';

translate('es', 'common.cancel');                    // 'Cancelar'
translate('es', 'common.book', { count: 5 });        // '5 libros'
translate('es', 'settings.removeLanguageTitle', { language: 'Español' });
```

The package holds no language state. Each app owns its own `uiLanguage` and
passes a locale in — that is the whole reason this isn't i18next.

Lookup order is **requested locale → English → the key itself**, so a missing
translation degrades to English instead of showing `settings.appLanguage` to a
user. `es.ts` is therefore `Partial` by design and can be filled in gradually.

## Adding or changing a string

1. Add the key to `src/en.ts` first — English is the fallback, so a key absent
   there has nothing to fall back to.
2. Add the Spanish to `src/es.ts` (optional; it will fall back until you do).
3. `npm test` — the suite checks both directions: no Spanish key orphaned from
   English, and `{{placeholders}}` consistent between locales.

Plurals use `_one` / `_other` suffixes selected by `count`. Interpolation is
`{{name}}`.

## Releasing

Consumers pin a tag, so a change here reaches them in three steps:

```bash
npm test && git commit -am "..." && git tag v1.1.0 && git push --tags
# then bump the #vX.Y.Z in both repos' package.json
```

That is the deliberate cost of a single source of truth. If it ever outweighs
the benefit, the fallback is a vendored copy per repo plus a parity test.

## Build

`dist/` is CommonJS, built by `prepare` — which npm runs automatically on a git
install, so consumers never need a build step. CJS rather than ESM because the
mobile app's `jest-expo` `transformIgnorePatterns` does not cover this package;
an ESM build would reach Jest untransformed and fail to parse.

`dist/` is intentionally not committed — it would be a second source of truth
that can go stale against `src/`.
