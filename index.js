const fs = require('fs');
const path = require('path');
const projectPath = '.';
var sourcePath = path.join(projectPath, 'i18n');
var destPath = path.join(projectPath, '.elm-i18n');
var destNamespacePath = path.join(destPath, 'I18n');

const configJson = path.join(projectPath, 'i18n.json')
if (fs.existsSync(configJson)) {
    const json = require(configJson);
    sourcePath = path.join(projectPath, json.source);
    destPath = path.join(projectPath, json.dest);
    destNamespacePath = path.join(destPath, 'I18n');
}

function main () {
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
            let rawJSON = fs.readFileSync(path.join(sourcePath, fileName));
            let parsedJSON = JSON.parse(rawJSON.toString().replace(/\\/g, '\\\\'));
            if (typed === null)
                typed = buildType(parsedJSON);
            buildLang(fileName, parsedJSON); 
        });
    });
}

function die (explanation) {
    console.log(explanation);
    process.exit(1);
}

module.exports = main

function buildType (data) {
    console.log('Bulding Type.elm');
    const filePath = path.join(destNamespacePath, 'Type.elm');

    let buffer = fs.createWriteStream(filePath);
    buffer.write('module I18n.Type exposing (..)\n\n\n');

    addRecord('', data, buffer);

    buffer.close();
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

    let buffer = fs.createWriteStream(filePath);
    buffer.write('module I18n.'+moduleName+' exposing (..)\n\n\n'
        + 'import I18n.Type exposing (..)\n\n\n'
    );

    addValue('', data, buffer);

    buffer.close();
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
