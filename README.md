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
2. Add the translation to each locale file (optional; it falls back until you do).
3. `npm test` — the guards run against **every** registered locale: no key
   orphaned from English, `{{placeholders}}` consistent, plural groups complete.
   `pretest` rebuilds first, because the suite runs against `dist/` and once
   passed green on a stale one.

Plurals use CLDR category suffixes selected by `count` — see below.
Interpolation is `{{name}}`.

## Adding a language

Adding a locale touches **no app code**. It is this, and then translation:

1. `cp src/en.ts src/fr.ts`, rename the export, translate the values. Leave out
   anything you are unsure of — missing keys fall back to English rather than
   showing a raw key, so a partial file ships safely.
2. Register it in `src/index.ts` (`LOCALES`) and in `src/languages.ts`
   (`UI_LANGUAGES`, and `LANGUAGE_LABELS` if the label is not there yet).
   A test fails if those two lists disagree.
3. `npm test`. Every guard is driven off `LOCALES`, so the new language is held
   to all of them automatically: no key absent from English, placeholders
   preserved, every plural group offering an `_other`.
4. Release, and repin both consumers — see **Releasing**.

The irreducible cost is translating ~534 strings. Everything around it is the
four steps above.

### Plurals

`translate()` selects the variant with `Intl.PluralRules`, so each locale gets
its own rules rather than English's:

| Language | Categories | Suffixes to supply |
|---|---|---|
| English, Spanish, German… | 2 | `_one` `_other` |
| French | 2 (but 0 is singular) | `_one` `_other` |
| Polish, Russian, Czech | 3 | `_one` `_few` `_many` `_other` |
| Arabic | 6 | `_zero` `_one` `_two` `_few` `_many` `_other` |

Supplying only `_one`/`_other` is fine: an unmatched category falls back to
that locale's own `_other` **before** falling back to English, so the sentence
stays in one language. `_other` is therefore required for every plural group,
and a test enforces it.

> Do not reintroduce `count === 1 ? one : other`. It is silently wrong rather
> than broken — Russian `3` and `5` take different words, and Arabic has six.

### Right-to-left

`isRTL(code)` and `directionOf(code)` say which languages mirror; both match on
the primary subtag, so `ar-EG` counts. `RTL_LANGUAGES` is deliberately wider
than the interface offers — a *content* pack can be RTL before the UI is
translated.

Both apps are wired for it:

- **Web** sets `<html dir>` from the UI language. All direction-sensitive
  styling uses logical utilities (`ms-`, `pe-`, `start-`, `text-start`), which
  are identical in LTR — **do not reintroduce `ml-`, `left-`, `text-left`**.
- **Mobile** calls `I18nManager.forceRTL`. React Native mirrors physical
  `left`/`right`/`marginLeft` itself (`doLeftAndRightSwapInRTL` is on by
  default), so styles need no conversion there.

> ⚠️ **Mobile needs an app restart to change direction.** React Native mirrors
> at startup and cannot re-mirror a running app, so `setUiLanguage` returns
> `{ requiresRestart }` and Settings tells the user. Do not treat a language
> switch that "did nothing" as a bug before checking for that prompt.

**Still open:** passage text takes its direction from the *interface*, not the
book. An English book under an Arabic interface shows bidi artefacts. Fixing it
means giving the passage container its own `dir` from the content language, on
both platforms.

## Guarding against drift

`immerse-i18n-check` ships with this package and fails when a user-visible
string is hardcoded instead of read through `t()`:

```bash
npx immerse-i18n-check src
```

Both apps run it — mobile as a jest test, web as `npm run i18n:check`.
Deliberate exceptions live in the consumer's `package.json`:

```json
"i18nCheck": {
  "allow": ["Immerse"],
  "ignorePaths": ["__tests__"]
}
```

`allow` matches the flagged text exactly, so it cannot quietly widen. This
exists because both apps had accumulated ~100 stray literals before anything
was checking — a cost that multiplies with every language added.

Two things this has been wrong about, both worth knowing before trusting a
clean run:

- **`allow` hides real findings.** Mobile's Tags and Notes screens read as
  translated for a release because their headers sat in `allow` from an earlier
  sweep. An entry added to silence one false positive keeps silencing the same
  text after it becomes a genuine bug, so read the list rather than the exit
  code when a screen looks suspiciously clean.
- **A pattern the scanner has no rule for is invisible, not absent.** The whole
  navigation chrome stayed English through a "fully translated" release because
  React Navigation declares labels as object properties. Alert button labels,
  ternaries inside JSX braces, and `[key, label]` array rows were each found the
  same way. Spot-check a real screen against the report before believing it.

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
