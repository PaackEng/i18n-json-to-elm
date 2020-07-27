# i18n-json-to-elm
Generates Elm sources from i18n's JSONs.

## Instructions

* Download the json from POEditor using "key - value" format.
* Save it inside an `i18n` (configurable as `"source"`) folder in your project's path.
* Add `.elm-i18n` (configurable as `"dest"`) to `source-directories` in your `elm.json`.

## Configuration

Create a i18n.json with the following contents:
```json
{
    "source": "i18n",
    "dest": ".elm-i18n"
}
```

## Running


### Parcel

If you add the library to package.json, it gets automatically activated on everytime you run parcel.

### CLI

Just run `npx i18n-json-to-elm`.