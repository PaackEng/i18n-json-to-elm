import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { Writable } from 'stream';

const projectPath = '.';
let sourcePath = path.join(projectPath, 'i18n');
let destPath = path.join(projectPath, '.elm-i18n');
let moduleNamespace = 'I18n';
let destNamespacePath = path.join(destPath, moduleNamespace);
const configJson = path.join(projectPath, 'i18n.json');
type Config = Partial<{ source: string, dest: string, namespace: string }>;

export function main (): void {
    if (fs.existsSync(configJson)) {
        const rawJSON = fs.readFileSync(configJson);
        const json: Config = JSON.parse(rawJSON.toString());
        if (json.source != undefined)
            sourcePath = path.join(projectPath, json.source);
        if (json.dest != undefined)
            destPath = path.join(projectPath, json.dest);
        if (json.namespace != undefined)
            moduleNamespace = json.namespace;
        destNamespacePath = path.join(destPath, ...moduleNamespace.split('.'));
    }

    if (!fs.existsSync(destPath))
        fs.mkdirSync(destPath);
    if (!fs.existsSync(destNamespacePath))
        fs.mkdirSync(destNamespacePath);

    fs.readdir(sourcePath, function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }

        let typed: boolean | null = null;

        files.forEach(function (fileName) {
            if(fileName.startsWith('.')) return;
            if(!fileName.endsWith('.json')) {
                console.log('Ignoring "' + fileName + '".');
                return;
            }

            const rawJSON = fs.readFileSync(path.join(sourcePath, fileName));
            const parsedJSON = JSON.parse(rawJSON.toString().replace(/\\/g, '\\\\'));
            if (typed === null)
                typed = buildTypes(parsedJSON);
            buildLang(fileName, parsedJSON);
        });
    });
}

function die (explanation: string): never {
    console.log(explanation);
    return process.exit(1);
}

function buildTypes (data: JSON): boolean {
    console.log('Bulding Types.elm / Decoders.elm');
    const typesBuffer = pipeToElmFormat(path.join(destNamespacePath, 'Types.elm'));
    const decodersBuffer = pipeToElmFormat(path.join(destNamespacePath, 'Decoders.elm'));

    typesBuffer.write(`module ${moduleNamespace}.Types exposing (..)\n`);
    decodersBuffer.write(`module ${moduleNamespace}.Decoders exposing (..)\n`
        +`import ${moduleNamespace}.Types as Types\n`
        +'import Json.Decode as Decode exposing (Decoder)\n'
        +'\n'
        +'i18nField : Decoder (String -> a) -> Decoder a\n'
        +'i18nField context key =\n'
        +'    \n'
        +'    [ Decode.field key Decode.string\n'
        +'    , Decode.succeed <| context + "." + key\n'
        +'    ]\n'
        +'    |> Decode.oneOf\n'
        +'    |> Decode.map\n'
        );

    addRecord('', '', data, typesBuffer, decodersBuffer);

    typesBuffer.end();
    decodersBuffer.end();
    return true;
}

const subEntryRegex = /(?<={{)([^}]+)(?=}})/g;
const subEntrySed = /{{([^}]+)}}/g;

function addRecord(name: string, context: string, data: JSON, typesBuffer: Writable, decodersBuffer: Writable): void {
    const record: string[] = [];
    const decoder: string[] = [];

    Object.entries(data).forEach(([key, value]) => {
        const fieldKey = asFieldName(key);

        if (Array.isArray(value)) {
            die('Unexpected array in JSON');
        } else if (typeof value == 'string') {
            const subEntries = value.match(subEntryRegex);
            if (subEntries == null) {
                record.push(fieldKey + " : String");
                decoder.push(`i18nField "${context}" "${key}"`);
            } else {
                record.push(
                    fieldKey
                    + " : { "
                    + subEntries.map((v) => asFieldName(v) + ' : String').join(", ")
                    + " } -> String"
                );
                decoder.push(
                    'Decode.map (\\value '
                    + subEntries.map((v) => asFieldName(v)).join(' ')
                    + ' -> value |> '
                    + subEntries.map((v) => `String.replace "{{${v}}}" ${asFieldName(v)}`).join(' |> ')
                    + ') Decode.string'
                );
            }
        } else if (value !== null && typeof value == 'object') {
            const newRecord = (name + capitalize(key));
            const newContext = (context == '' ? key : context + '.' + key);
            record.push(fieldKey + " : " + newRecord);
            decoder.push(`Decode.map (Decode.field "${key}" ${fieldKey})`);
            addRecord(newRecord, newContext, value, typesBuffer, decodersBuffer);
        } else
            die('Invalid JSON');
    });

    if (name == '')
        name = 'Root';

    typesBuffer.write('type alias ' + name + ' =\n    { ');
    typesBuffer.write(record.join('\n    , '));
    typesBuffer.write('\n    }\n\n\n');

    if (context == '')
        context = 'root';
    else
        context = asFieldName(name);

    decodersBuffer.write(`${context} : Decoder Types.${name}\n`
        +`${context} =\n`
        +`    Decode.succeed Types.${name}\n`);
    if (decoder.length > 0) {
        decodersBuffer.write('\n    |> ');
        decodersBuffer.write(decoder.join('\n    |> '));
    }
    decodersBuffer.write('\n');
}

function buildLang (sourceFileName: string, data: JSON): boolean {
    const moduleName = capitalize(path.basename(sourceFileName, '.json'));
    const fileName = moduleName+'.elm';
    console.log('Building ' + fileName);
    const filePath = path.join(destNamespacePath, fileName);
    const buffer = pipeToElmFormat(filePath);

    buffer.write(`module ${moduleNamespace}.${moduleName} exposing (..)\n`
        +`import ${moduleNamespace}.Types exposing (..)\n`)

    addValue('', data, buffer);

    buffer.end();
    return true;
}

function addValue(name: string, data: JSON, buffer: Writable): void {
    const record: string[] = [];

    Object.entries(data).forEach(([key, value]) => {
        const fieldKey = asFieldName(key);

        if (Array.isArray(value)) {
            die('Unexpected array in JSON');
        } else if (typeof value == 'string') {
            const subEntries = value.match(subEntryRegex);
            if (subEntries == null)
                record.push(fieldKey + " = \"" + value + "\"");
            else
                record.push(fieldKey
                    + " = \\{ "
                    + subEntries.map((v) => asFieldName(v)).join(", ")
                    + " } -> \""
                    + value.replace(subEntrySed, "\" ++ $1 ++ \"")
                    + "\""
                );
        } else if (value !== null && typeof value == 'object') {
            const newRecord = (name + capitalize(key))
            record.push(fieldKey + " = " + asFieldName(newRecord));
            addValue(newRecord, value, buffer);
        } else
            die('Invalid JSON');
    });

    if (name == '')
        name = 'Root';

    const fieldName = asFieldName(name);

    buffer.write(`${fieldName} : ${name}\n${fieldName} =\n    {\n`);
    buffer.write(record.join('\n    , '));
    buffer.write('\n    }\n');
}

function pipeToElmFormat(filePath: string): Writable | never {
    const subprocess = child_process.spawn('elm-format',
        ['--stdin', '--output', filePath],
        { stdio: [ 'pipe', 1, 2 ] }
    );

    if (subprocess.stdin === null) {
        return die('Unable to pipe to elm-format!');
    }

    return subprocess.stdin;
}

function capitalize (s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function asFieldName (s: string): string {
    const head = s.charAt(0);

    if (head >= '0' && head <= '9')
        return 'n' + s;

    return s.charAt(0).toLowerCase() + s.slice(1)
}
