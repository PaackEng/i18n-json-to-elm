import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { Writable } from 'stream';

const projectPath = '.';
let sourcePath = path.join(projectPath, 'i18n');
let destPath = path.join(projectPath, '.elm-i18n');
let moduleNamespace = 'I18n';
let destNamespacePath = path.join(destPath, moduleNamespace);
let emptyFallback: string | null = null;
let rootType = 'Root';
const configJson = path.join(projectPath, 'i18n.json');
type Config = Partial<{
  source: string;
  dest: string;
  namespace: string;
  generateDecoders: boolean;
  generateMockLanguage: boolean;
  languages: string[];
  emptyFallback: string | null;
  rootType: string;
}>;

let typeGenerated: boolean | null = null;
const buildConfig = {
  generateDecoders: false,
  generateMockLanguage: false,
};

export function main(): void {
  let languages: string[] = [];

  if (fs.existsSync(configJson)) {
    console.log('Reading config...');
    const rawJSON = fs.readFileSync(configJson);
    const json: Config = JSON.parse(rawJSON.toString());
    if (json.source != undefined)
      sourcePath = path.join(projectPath, json.source);
    if (json.dest != undefined) destPath = path.join(projectPath, json.dest);
    if (json.namespace != undefined) moduleNamespace = json.namespace;
    destNamespacePath = path.join(destPath, ...moduleNamespace.split('.'));
    if (json.generateDecoders != undefined)
      buildConfig.generateDecoders = json.generateDecoders;
    if (json.generateMockLanguage != undefined)
      buildConfig.generateMockLanguage = json.generateMockLanguage;
    if (json.languages != undefined) languages = json.languages;
    if (json.emptyFallback != undefined) emptyFallback = json.emptyFallback;
    if (json.rootType != undefined) rootType = json.rootType;
  }

  if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
  if (!fs.existsSync(destNamespacePath)) fs.mkdirSync(destNamespacePath);

  if (languages.length < 1) {
    fs.readdir(sourcePath, function (err, pathFiles) {
      if (err) {
        return console.log(`Unable to scan directory: ${err}`);
      }

      pathFiles.forEach(function (fileName) {
        if (fileName.startsWith('.')) return;
        if (!fileName.endsWith('.json')) {
          console.log(`Ignoring "${fileName}".`);
          return;
        }

        transformFile(fileName);
      });
    });
  } else {
    languages.map((el) => `${el}.json`).forEach(transformFile);
  }
}

function transformFile(fileName: string): void {
  console.log(`Working with "${fileName}".`);
  const rawJSON = fs.readFileSync(path.join(sourcePath, fileName));
  const parsedJSON = JSON.parse(rawJSON.toString().replace(/\\/g, '\\\\'));
  if (typeGenerated === null) typeGenerated = buildHelpers(parsedJSON);
  buildLang(fileName, parsedJSON);
}

function die(explanation: string): never {
  console.log(explanation);
  return process.exit(1);
}

function buildHelpers(data: JSON): boolean {
  let announce = 'Bulding Types.elm';
  if (buildConfig.generateDecoders) announce += ' / Decoders.elm';
  if (buildConfig.generateMockLanguage) announce += ' / MockLanguage.elm';
  console.log(announce);

  const typesBuffer = pipeToElmFormat(
    path.join(destNamespacePath, 'Types.elm'),
  );
  const decodersBuffer = buildConfig.generateDecoders
    ? pipeToElmFormat(path.join(destNamespacePath, 'Decoders.elm'))
    : null;
  const mockBuffer = buildConfig.generateMockLanguage
    ? pipeToElmFormat(path.join(destNamespacePath, 'MockLanguage.elm'))
    : null;

  typesBuffer.write(`module ${moduleNamespace}.Types exposing (..)\n`);
  if (decodersBuffer !== null)
    decodersBuffer.write(
      `module ${moduleNamespace}.Decoders exposing (..)\n` +
        `import ${moduleNamespace}.Types as Types\n` +
        'import Json.Decode as Decode exposing (Decoder)\n' +
        `\n${decodersHelpers}`,
    );
  if (mockBuffer !== null)
    mockBuffer.write(
      `module ${moduleNamespace}.MockLanguage exposing (..)\n` +
        `import ${moduleNamespace}.Types as Types\n`,
    );

  addHelper({
    name: '',
    context: '',
    data,
    typesBuffer,
    decodersBuffer,
    mockBuffer,
  });

  typesBuffer.end();
  if (decodersBuffer !== null) decodersBuffer.end();
  if (mockBuffer !== null) mockBuffer.end();
  return true;
}

const subEntryRegex = /(?<={{)([^}]+)(?=}})/g;
const subEntrySed = /{{([^}]+)}}/g;

type AddHelperAccumulator = {
  name: string;
  context: string;
  data: JSON;
  typesBuffer: Writable;
  decodersBuffer: Writable | null;
  mockBuffer: Writable | null;
};

function addHelper(accumulator: AddHelperAccumulator): void {
  const { data, typesBuffer, decodersBuffer, mockBuffer } = accumulator;
  let { name, context } = accumulator;

  const record: string[] = [];
  const decoder: string[] = [];
  const mock: string[] = [];

  Object.entries(data).forEach(([key, value]) => {
    const fieldKey = asFieldName(key);
    const newContext = context == '' ? key : `${context}.${key}`;

    if (Array.isArray(value)) {
      die('Unexpected array in JSON');
    } else if (typeof value == 'string') {
      const subEntries = value.match(subEntryRegex);
      if (subEntries == null) {
        record.push(`${fieldKey} : String`);
        decoder.push(`i18nField "${key}" fallback.${fieldKey}`);
        mock.push(`${fieldKey} = "[${newContext}]"`);
      } else {
        const signatureFields = subEntries
          .map((v) => `${asFieldName(v)} : String`)
          .join(', ');
        record.push(`${fieldKey} : { ${signatureFields} } -> String`);

        const lambdaParameters = subEntries
          .map((v) => asFieldName(v))
          .join(', ');
        const arrayEntries = subEntries
          .map((v) => `( "${v}", ${asFieldName(v)} )`)
          .join('\n , ');
        decoder.push(
          `i18nReplaceable "${key}" (\\value {${lambdaParameters}} -> translator [${arrayEntries}] value ) fallback.${fieldKey}`,
        );

        mock.push(`${fieldKey} = always "[${newContext}]"`);
      }
    } else if (value !== null && typeof value == 'object') {
      const newRecord = name + capitalize(key);
      const newFunction = asFieldName(newRecord);
      const fallbackFieldName = asFieldName(key);
      record.push(`${fieldKey} : ${newRecord}`);
      decoder.push(
        `i18nRecord "${key}" (${newFunction} translator) fallback.${fallbackFieldName}`,
      );
      mock.push(`${fieldKey} = ${newFunction}`);
      addHelper({
        name: newRecord,
        context: newContext,
        data: value,
        typesBuffer,
        decodersBuffer,
        mockBuffer,
      });
    } else die('Invalid JSON');
  });

  if (name == '') name = rootType;

  typesBuffer.write(`type alias ${name} =\n    { `);
  typesBuffer.write(record.join('\n    , '));
  typesBuffer.write('\n    }\n\n\n');

  if (context == '') context = 'root';
  else context = asFieldName(name);

  if (decodersBuffer !== null) {
    decodersBuffer.write(
      `${context} : I18nTranslator -> Types.${name} -> Decoder Types.${name}\n` +
        `${context} translator fallback =\n` +
        `    Decode.succeed Types.${name}\n`,
    );
    if (decoder.length > 0) {
      decodersBuffer.write('\n    |> ');
      decodersBuffer.write(decoder.join('\n    |> '));
    }
    decodersBuffer.write('\n');
  }

  if (mockBuffer !== null) {
    mockBuffer.write(`${context} : Types.${name}\n` + `${context} =\n    { `);
    mockBuffer.write(mock.join('\n    , '));
    mockBuffer.write('\n    }\n\n\n');
  }
}

function buildLang(sourceFileName: string, data: JSON): boolean {
  const moduleName = capitalize(path.basename(sourceFileName, '.json'));
  const fileName = `${moduleName}.elm`;
  console.log(`Building "${fileName}".`);
  const filePath = path.join(destNamespacePath, fileName);
  const buffer = pipeToElmFormat(filePath);

  buffer.write(
    `module ${moduleNamespace}.${moduleName} exposing (..)\n` +
      `import ${moduleNamespace}.Types exposing (..)\n`,
  );

  if (emptyFallback && emptyFallback !== moduleName) {
    buffer.write(
      `import ${moduleNamespace}.${emptyFallback} as EmptyFallback\n`,
    );
  }

  addValue({ moduleName, name: '', data, buffer });

  buffer.end();
  return true;
}

type AddValueAccumulator = {
  moduleName: string;
  name: string;
  data: JSON;
  buffer: Writable;
};

function addValue(accumulator: AddValueAccumulator): void {
  const { buffer, data } = accumulator;
  const { name } = accumulator;
  const rootedName = name == '' ? rootType : name;

  const record: string[] = [];

  Object.entries(data).forEach(([key, value]) => {
    const fieldKey = asFieldName(key);

    if (Array.isArray(value)) {
      die('Unexpected array in JSON');
    } else if (typeof value == 'string') {
      const subEntries = value.match(subEntryRegex);
      if (
        value == '' &&
        emptyFallback &&
        emptyFallback !== accumulator.moduleName
      ) {
        record.push(
          `${fieldKey} = EmptyFallback.${asFieldName(rootedName)}.${fieldKey}`,
        );
      } else if (subEntries == null) {
        record.push(`${fieldKey} = "${value}"`);
      } else {
        const lambdaParameters = subEntries
          .map((v) => asFieldName(v))
          .join(', ');

        const replacedSubEntry = value.replace(subEntrySed, '" ++ $1 ++ "');
        record.push(
          `${fieldKey} = \\{ ${lambdaParameters} } -> "${replacedSubEntry}"`,
        );
      }
    } else if (value !== null && typeof value == 'object') {
      const newRecord = name + capitalize(key);
      record.push(`${fieldKey} = ${asFieldName(newRecord)}`);
      addValue({
        moduleName: accumulator.moduleName,
        name: newRecord,
        data: value,
        buffer,
      });
    } else die('Invalid JSON');
  });

  const fieldName = asFieldName(rootedName);

  buffer.write(`${fieldName} : ${rootedName}\n${fieldName} =\n    {\n`);
  buffer.write(record.join('\n    , '));
  buffer.write('\n    }\n');
}

function pipeToElmFormat(filePath: string): Writable | never {
  const subprocess = child_process.spawn(
    'elm-format',
    ['--stdin', '--output', filePath],
    { stdio: ['pipe', 1, 2] },
  );

  if (subprocess.stdin === null) {
    return die('Unable to pipe to elm-format!');
  }

  return subprocess.stdin;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function asFieldName(s: string): string {
  const head = s.charAt(0);

  if (head >= '0' && head <= '9') return `n${s}`;

  return s.charAt(0).toLowerCase() + s.slice(1);
}

const decodersHelpers = `
type alias I18nTranslator =
    List ( String, String ) -> String -> String


i18nField : String -> String -> Decoder (String -> a) -> Decoder a
i18nField key fallback =
    [ Decode.field key Decode.string
    , Decode.succeed fallback
    ]
        |> Decode.oneOf
        |> i18nDecodePipe


i18nReplaceable :
    String
    -> (String -> (b -> String))
    -> (b -> String)
    -> Decoder ((b -> String) -> a)
    -> Decoder a
i18nReplaceable key valueMapper fallback =
    [ Decode.map valueMapper <| Decode.field key Decode.string
    , Decode.succeed <| fallback
    ]
        |> Decode.oneOf
        |> i18nDecodePipe


i18nRecord :
    String
    -> (b -> Decoder b)
    -> b
    -> Decoder (b -> a)
    -> Decoder a
i18nRecord key decoder fallback =
    [ Decode.field key (decoder fallback)
    , Decode.succeed fallback
    ]
        |> Decode.oneOf
        |> i18nDecodePipe


i18nDecodePipe : Decoder a -> Decoder (a -> b) -> Decoder b
i18nDecodePipe next =
    Decode.andThen (\\previous -> Decode.map previous next)

`;
