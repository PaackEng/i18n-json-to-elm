import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

const projectPath = '.';
var sourcePath = path.join(projectPath, 'i18n');
var destPath = path.join(projectPath, '.elm-i18n');
var moduleNamespace = 'I18n';
var destNamespacePath = path.join(destPath, moduleNamespace);
const configJson = path.join(projectPath, 'i18n.json')

export function main () {
    if (fs.existsSync(configJson)) {
        const rawJSON = fs.readFileSync(configJson);
        const json = JSON.parse(rawJSON.toString());
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

        let typed = null;

        files.forEach(function (fileName) {
            if(fileName.startsWith('.')) return;
            if(!fileName.endsWith('.json')) return;

            let rawJSON = fs.readFileSync(path.join(sourcePath, fileName));
            let parsedJSON = JSON.parse(rawJSON.toString().replace(/\\/g, '\\\\'));
            if (typed === null)
                typed = buildTypes(parsedJSON);
            buildLang(fileName, parsedJSON);
        });
    });
}

function die (explanation) {
    console.log(explanation);
    process.exit(1);
}

function buildTypes (data) {
    console.log('Bulding Types.elm');
    const filePath = path.join(destNamespacePath, 'Types.elm');

    const subprocess = child_process.spawn('elm-format',
        ['--stdin', '--output', filePath],
        { stdio: [ 'pipe', 1, 2 ] }
    );

    let buffer = subprocess.stdin;
    buffer.write(`module ${moduleNamespace}.Types exposing (..)\n\n\n`);

    addRecord('', data, buffer);

    buffer.end();
    return true;
}

const subEntryRegex = /(?<={{)([^}]+)(?=}})/g;
const subEntrySed = /{{([^}]+)}}/g;

function addRecord(name, data, buffer) {
    var record = [];

    Object.entries(data).forEach(([key, value]) => {
        const fieldKey = asFieldName(key);

        if (Array.isArray(value)) {
            die('Unexpected array in JSON');
        } else if (typeof value == 'string') {
            const subEntries = value.match(subEntryRegex);
            if (subEntries == null)
                record.push(fieldKey + " : String");
            else
                record.push(fieldKey
                    + " : { "
                    + subEntries.map((v) => asFieldName(v) + ' : String').join(", ")
                    + " } -> String"
                );
        } else if (value !== null && typeof value == 'object') {
            const newRecord = (name + capitalize(key))
            record.push(fieldKey + " : " + newRecord);
            addRecord(newRecord, value, buffer);
        } else
            die('Invalid JSON');
    });

    if (name == '')
        name = 'Root';

    buffer.write('type alias ' + name + ' =\n    { ');
    buffer.write(record.join('\n    , '));
    buffer.write('\n    }\n\n\n');
}

function buildLang (sourceFileName, data) {
    const moduleName = path.basename(sourceFileName, '.json');
    const fileName = moduleName+'.elm';
    console.log('Building ' + fileName);
    const filePath = path.join(destNamespacePath, fileName);

    const subprocess = child_process.spawn('elm-format',
        ['--stdin', '--output', filePath],
        { stdio: [ 'pipe', 1, 2 ] }
    );

    let buffer = subprocess.stdin;

    buffer.write(`module ${moduleNamespace}.${moduleName} exposing (..)\n\n\nimport ${moduleNamespace}.Types exposing (..)\n\n\n`)

    addValue('', data, buffer);

    buffer.end();
    return true;
}

function addValue(name, data, buffer) {
    var record = [];

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

    let fieldName = asFieldName(name);

    buffer.write(fieldName + ' : ' + name + '\n'
        + fieldName + ' =\n    { ');
    buffer.write(record.join('\n    , '));
    buffer.write('\n    }\n\n\n');
}

function capitalize (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function asFieldName (s) {
    let head = s.charAt(0);

    if (head >= '0' && head <= '9')
        return 'n' + s;

    return s.charAt(0).toLowerCase() + s.slice(1)
}
