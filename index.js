"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
const { readFile, writeFile, unlink } = require('fs.promised');
const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const { runNpmInstall, runPackageJsonScript, } = require('@now/build-utils/fs/run-user-scripts.js');
const glob = require('@now/build-utils/fs/glob.js');
function getPackageJsonPath(entryPath, workPath, config) {
    if (config.packageJson) {
        return path_1.default.join(workPath, config.packageJson);
    }
    return path_1.default.join(entryPath, 'package.json');
}
async function readPackageJson(pathToPackageJson) {
    const packagePath = pathToPackageJson;
    try {
        return JSON.parse(await readFile(packagePath, 'utf8'));
    }
    catch (err) {
        console.log('no package.json found in entry');
        return {};
    }
}
async function writePackageJson(pathToPackageJson, packageJson) {
    await writeFile(pathToPackageJson, JSON.stringify(packageJson, null, 2));
}
async function writeNpmRc(workPath, token) {
    await writeFile(path_1.default.join(workPath, '.npmrc'), `//registry.npmjs.org/:_authToken=${token}`);
}
exports.config = {
    maxLambdaSize: '5mb',
};
exports.build = async ({ files, workPath, entrypoint, config = {}, }) => {
    utils_1.validateEntrypoint(entrypoint);
    console.log('downloading user files...');
    const entryDirectory = path_1.default.dirname(entrypoint);
    await download(files, workPath);
    const entryPath = path_1.default.join(workPath, entryDirectory);
    const pkg = await readPackageJson(getPackageJsonPath(entryPath, workPath, config));
    console.log(`MODE: serverless`);
    if (!pkg.scripts || !pkg.scripts['now-build']) {
        console.warn('WARNING: "now-build" script not found. Adding \'"now-build": "tsx-docs build"\' to "package.json" automatically');
        pkg.scripts = Object.assign({ 'now-build': 'tsx-docs build' }, (pkg.scripts || {}));
        console.log('normalized package.json result: ', pkg);
        await writePackageJson(getPackageJsonPath(entryPath, workPath, config), pkg);
    }
    if (process.env.NPM_AUTH_TOKEN) {
        console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc');
        await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN);
    }
    console.log('installing dependencies...');
    await runNpmInstall(entryPath, ['--prefer-offline']);
    console.log('running user script...');
    await runPackageJsonScript(entryPath, 'now-build');
    if (process.env.NPM_AUTH_TOKEN) {
        await unlink(path_1.default.join(entryPath, '.npmrc'));
    }
    const lambdas = {};
    console.log('preparing lambda files...');
    const launcherFiles = {
        'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
        'now__launcher.js': new FileFsRef({
            fsPath: path_1.default.join(__dirname, 'launcher.js'),
        }),
    };
    const pages = await glob('**/*.js', path_1.default.join(entryPath, '.next', 'serverless', 'pages'));
    const pageKeys = Object.keys(pages);
    if (pageKeys.length === 0) {
        throw new Error('No serverless pages were built. https://err.sh/zeit/now-builders/now-next-no-serverless-pages-built');
    }
    await Promise.all(pageKeys.map(async (page) => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
            return;
        }
        const pathname = page.replace(/\.js$/, '');
        console.log(`Creating lambda for page: "${page}"...`);
        lambdas[path_1.default.join(entryDirectory, pathname)] = await createLambda({
            files: Object.assign({}, launcherFiles, { 'page.js': pages[page] }),
            handler: 'now__launcher.launcher',
            runtime: 'nodejs8.10',
        });
        console.log(`Created lambda for page: "${page}"`);
    }));
    const nextStaticFiles = await glob('**', path_1.default.join(entryPath, '.next', 'static'));
    const staticFiles = Object.keys(nextStaticFiles).reduce((mappedFiles, file) => (Object.assign({}, mappedFiles, { [path_1.default.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[file] })), {});
    const nextStaticDirectory = utils_1.onlyStaticDirectory(utils_1.includeOnlyEntryDirectory(files, entryDirectory));
    const staticDirectoryFiles = Object.keys(nextStaticDirectory).reduce((mappedFiles, file) => (Object.assign({}, mappedFiles, { [path_1.default.join(entryDirectory, file)]: nextStaticDirectory[file] })), {});
    const customStaticDirectory = await glob('**', path_1.default.join(entryPath, 'static'));
    const customStaticDirectoryFiles = Object.keys(customStaticDirectory).reduce((mappedFiles, file) => (Object.assign({}, mappedFiles, { [path_1.default.join(entryDirectory, `static/${file}`)]: customStaticDirectory[file] })), {});
    return Object.assign({}, lambdas, staticFiles, staticDirectoryFiles, customStaticDirectoryFiles);
};
