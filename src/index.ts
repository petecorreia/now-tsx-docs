import path from 'path'
import { PackageJson } from 'package-json'
import {
	BuildParams,
	validateEntrypoint,
	onlyStaticDirectory,
	includeOnlyEntryDirectory,
} from './utils'

const { readFile, writeFile, unlink } = require('fs.promised')

const { createLambda } = require('@now/build-utils/lambda.js')
const download = require('@now/build-utils/fs/download.js')
const FileFsRef = require('@now/build-utils/file-fs-ref.js')
const {
	runNpmInstall,
	runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts.js')
const glob = require('@now/build-utils/fs/glob.js')

async function readPackageJson(entryPath: string) {
	const packagePath = path.join(entryPath, 'package.json')

	try {
		return JSON.parse(await readFile(packagePath, 'utf8'))
	} catch (err) {
		console.log('no package.json found in entry')
		return {}
	}
}

async function writePackageJson(workPath: string, packageJson: PackageJson) {
	await writeFile(
		path.join(workPath, 'package.json'),
		JSON.stringify(packageJson, null, 2)
	)
}

async function writeNpmRc(workPath: string, token: string) {
	await writeFile(
		path.join(workPath, '.npmrc'),
		`//registry.npmjs.org/:_authToken=${token}`
	)
}

exports.config = {
	maxLambdaSize: '5mb',
}

exports.build = async ({
	files,
	workPath,
	entrypoint,
	config = { staticDir: 'static' },
}: BuildParams) => {
	validateEntrypoint(entrypoint)

	console.log('downloading user files...')
	const entryDirectory = path.dirname(entrypoint)
	await download(files, workPath)
	const entryPath = path.join(workPath, entryDirectory)

	const pkg = await readPackageJson(entryPath)

	console.log(`MODE: serverless`)

	if (!pkg.scripts || !pkg.scripts['now-build']) {
		console.warn(
			'WARNING: "now-build" script not found. Adding \'"now-build": "tsx-docs build"\' to "package.json" automatically'
		)
		pkg.scripts = {
			'now-build': 'tsx-docs build',
			...(pkg.scripts || {}),
		}
		console.log('normalized package.json result: ', pkg)
		await writePackageJson(entryPath, pkg)
	}

	if (process.env.NPM_AUTH_TOKEN) {
		console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc')
		await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN)
	}

	console.log('installing dependencies...')
	await runNpmInstall(entryPath, ['--prefer-offline'])
	console.log('running user script...')
	await runPackageJsonScript(entryPath, 'now-build')

	if (process.env.NPM_AUTH_TOKEN) {
		await unlink(path.join(entryPath, '.npmrc'))
	}

	const lambdas: { [key: string]: any } = {}

	console.log('preparing lambda files...')
	const launcherFiles = {
		'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
		'now__launcher.js': new FileFsRef({
			fsPath: path.join(__dirname, 'launcher.js'),
		}),
	}
	const pages = await glob(
		'**/*.js',
		path.join(entryPath, '.next', 'serverless', 'pages')
	)

	const pageKeys = Object.keys(pages)

	if (pageKeys.length === 0) {
		throw new Error(
			'No serverless pages were built. https://err.sh/zeit/now-builders/now-next-no-serverless-pages-built'
		)
	}

	await Promise.all(
		pageKeys.map(async page => {
			// These default pages don't have to be handled as they'd always 404
			if (['_app.js', '_error.js', '_document.js'].includes(page)) {
				return
			}

			const pathname = page.replace(/\.js$/, '')

			console.log(`Creating lambda for page: "${page}"...`)
			lambdas[path.join(entryDirectory, pathname)] = await createLambda({
				files: {
					...launcherFiles,
					'page.js': pages[page],
				},
				handler: 'now__launcher.launcher',
				runtime: 'nodejs8.10',
			})
			console.log(`Created lambda for page: "${page}"`)
		})
	)

	const nextStaticFiles = await glob(
		'**',
		path.join(entryPath, '.next', 'static')
	)
	const staticFiles = Object.keys(nextStaticFiles).reduce(
		(mappedFiles, file) => ({
			...mappedFiles,
			[path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[
				file
			],
		}),
		{}
	)

	const nextStaticDirectory: { [key: string]: string } = onlyStaticDirectory(
		includeOnlyEntryDirectory(files, entryDirectory),
		config.staticDir
	)
	const staticDirectoryFiles = Object.keys(nextStaticDirectory).reduce(
		(mappedFiles, file) => ({
			...mappedFiles,
			[path.join(entryDirectory, file)]: nextStaticDirectory[file],
		}),
		{}
	)

	return { ...lambdas, ...staticFiles, ...staticDirectoryFiles }
}
