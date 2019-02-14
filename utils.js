"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function validateEntrypoint(entrypoint) {
    if (!/package\.json$/.exec(entrypoint) &&
        !/tsx-docs\.config\.js$/.exec(entrypoint)) {
        throw new Error('Specified "src" for "now-tsx-docs" has to be "package.json" or "tsx-docs.config.js"');
    }
}
exports.validateEntrypoint = validateEntrypoint;
function excludeFiles(files, matcher) {
    return Object.keys(files).reduce((newFiles, filePath) => {
        if (matcher(filePath)) {
            return newFiles;
        }
        return Object.assign({}, newFiles, { [filePath]: files[filePath] });
    }, {});
}
exports.excludeFiles = excludeFiles;
function includeOnlyEntryDirectory(files, entryDirectory) {
    if (entryDirectory === '.') {
        return files;
    }
    function matcher(filePath) {
        return !filePath.startsWith(entryDirectory);
    }
    return excludeFiles(files, matcher);
}
exports.includeOnlyEntryDirectory = includeOnlyEntryDirectory;
function excludeLockFiles(files) {
    const newFiles = files;
    if (newFiles['package-lock.json']) {
        delete newFiles['package-lock.json'];
    }
    if (newFiles['yarn.lock']) {
        delete newFiles['yarn.lock'];
    }
    return files;
}
exports.excludeLockFiles = excludeLockFiles;
function onlyStaticDirectory(files) {
    function matcher(filePath) {
        return !filePath.startsWith('static');
    }
    return excludeFiles(files, matcher);
}
exports.onlyStaticDirectory = onlyStaticDirectory;
function normalizePackageJson(defaultPackageJson = {}) {
    const dependencies = {};
    const devDependencies = Object.assign({}, defaultPackageJson.dependencies, defaultPackageJson.devDependencies);
    if (devDependencies.react) {
        dependencies.react = devDependencies.react;
        delete devDependencies.react;
    }
    if (devDependencies['react-dom']) {
        dependencies['react-dom'] = devDependencies['react-dom'];
        delete devDependencies['react-dom'];
    }
    return Object.assign({}, defaultPackageJson, { dependencies: Object.assign({ 
            // react and react-dom can be overwritten
            react: 'latest', 'react-dom': 'latest' }, dependencies, { 
            // next-server is forced to canary
            'next-server': 'v7.0.2-canary.49' }), devDependencies: Object.assign({}, devDependencies, { 
            // next is forced to canary
            next: 'v7.0.2-canary.49', 'tsx-docs': 'latest', 
            // next-server is a dependency here
            'next-server': undefined }), scripts: Object.assign({}, defaultPackageJson.scripts, { 'now-build': 'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas' }) });
}
exports.normalizePackageJson = normalizePackageJson;
