# i18n-json-to-elm

Generates Elm sources from i18n's JSONs.

## Instructions

- Download the json from POEditor using "key - value" format.
- Save it inside an `i18n` (configurable as `"source"`) folder in your project's path.
- Add `.elm-i18n` (configurable as `"dest"`) to `source-directories` in your `elm.json`.

## Configuration

Create a i18n.json with the following contents:

```json
{
  "source": "i18n",
  "dest": ".elm-i18n",
  "namespace": "MyModuleName",
  "generateDecoders": true,
  "generateMockLanguage": true
}
```

- `"source"` defaults to `"i18n"`;
- `"dest"` defaults to `".elm-i18n"`;
- `"namespace"` defaults to `"I18n"`;
- `"generateDecoders"` defaults to `false`;
- `"generateMockLanguage"` defaults to `false`.

## Optional features

- `"generateDecoders"` generates a `Decoders.elm` with JSON decoders;
- `"generateMockLanguage"` generates a `MockLanguage.elm` where the value of each terms reflects their own `context.key`.

## Running

### CLI

Just run `npx i18n-json-to-elm`.
