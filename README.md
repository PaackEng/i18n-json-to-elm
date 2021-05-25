# i18n-json-to-elm

Generates Elm sources from i18n's JSONs.

## Instructions

- Download the JSON from POEditor, using "key - value" format.
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
  "generateMockLanguage": true,
  "languages": ["English"]
}
```

- `"source"` defaults to `"i18n"`;
- `"dest"` defaults to `".elm-i18n"`;
- `"namespace"` defaults to `"I18n"`;
- `"generateDecoders"` defaults to `false`;
- `"generateMockLanguage"` defaults to `false`.
- `"languages"` defaults to `[]` (when empty, it'll search for `${source}/*.json` instead).

## Optional features

- `"generateDecoders"` generates a `Decoders.elm` with JSON decoders;
- `"generateMockLanguage"` generates a `MockLanguage.elm` where the value of each terms reflects their own `context.key`.
- `"languages"` chooses what files to transform; helps when using with `"generateDecoders"` for loading non-specified languages during runtime.

## Running

### CLI

Just run `npx i18n-json-to-elm`.

## Example

This is how a valid `"i18n/English.json"` would look like:

```json
{
  "common": {
    "retry": "Retry",
    "loading": "Loading...",
    "username": "Username/Email",
    "password": "Password"
  },
  "dialogs": {
    "rename": {
      "title": "Renaming",
      "body": "From {{oldName}} to {{newName}}"
    }
  },
  "errors": {
    "httpFailure": "Network error.",
    "credInvalid": "Invalid credentials, please try again."
  }
}
```

This is how the resulting `"src/I18n/Types.elm"` will look like:

```elm
module I18n.Types exposing (..)


type alias Common =
    { retry : String
    , loading : String
    , username : String
    , password : String
    }


type alias DialogsRename =
    { title : String
    , body : { oldName : String, newName : String } -> String
    }


type alias Dialogs =
    { rename : DialogsRename
    }

type alias Errors =
    { httpFailure : String
    , credInvalid : String
    }


type alias Root =
    { common : Common
    , dialogs : Dialogs
    , errors : Errors
    }
```

This is how the resulting `"src/I18n/English.elm` will look like:

```elm
module I18n.Dummy exposing (..)

import I18n.Types exposing (..)


common : Common
common =
    { retry = "Retry"
    , loading = "Loading..."
    , username = "Username/Email"
    , password = "Password"
    }


dialogsRename : DialogsRename
dialogsRename =
    { title = "Renaming"
    , body = \{ oldName, newName } -> "From " ++ oldName ++ " to " ++ newName ++ ""
    }


dialogs : Dialogs
dialogs =
    { rename = dialogsRename
    }

-- [...]
```

The `src/I18n/MockLanguage.elm` looks like this:

```elm
common : Types.Common
common =
    { retry = "common.retry"
    , loading = "common.loading"
    , username = "common.username"
    , password = "common.password"
    }
```

While the `src/I18n/Decoders.elm` will look like this:

```elm
type alias I18nTranslator =
    List ( String, String ) -> String -> String

common : I18nTranslator -> Types.Common -> Decoder Types.Common
common curlyTranslator fallback = -- [...]

dialogsRename : I18nTranslator -> Types.DialogsRename -> Decoder Types.DialogsRename
dialogsRename curlyTranslator fallback = -- [...]

dialogs : I18nTranslator -> Types.Dialogs -> Decoder Types.Dialogs
dialogs curlyTranslator fallback = -- [...]

errors : I18nTranslator -> Types.Dialogs -> Decoder Types.Dialogs
errors curlyTranslator fallback = -- [...]

root : I18nTranslator -> Types.Dialogs -> Decoder Types.Dialogs
root curlyTranslator fallback = -- [...]
```
