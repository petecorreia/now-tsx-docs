import { PackageJson } from 'package-json'

export type Files = { [key: string]: any }

export type BuildParams = {
	files: Files
	entrypoint: string
	workPath: string
}

export function validateEntrypoint(entrypoint: string) {
	if (
		!/package\.json$/.exec(entrypoint) &&
		!/next\.config\.js$/.exec(entrypoint)
	) {
		throw new Error(
			'Specified "src" for "@now/next" has to be "package.json" or "next.config.js"'
		)
	}
}

export function excludeFiles(
	files: Files,
	matcher: (filePath: string) => boolean
) {
	return Object.keys(files).reduce((newFiles, filePath) => {
		if (matcher(filePath)) {
			return newFiles
		}
		return {
			...newFiles,
			[filePath]: files[filePath],
		}
	}, {})
}

export function includeOnlyEntryDirectory(
	files: Files,
	entryDirectory: string
) {
	if (entryDirectory === '.') {
		return files
	}

	function matcher(filePath: string) {
		return !filePath.startsWith(entryDirectory)
	}

	return excludeFiles(files, matcher)
}

export function excludeLockFiles(files: Files) {
	const newFiles = files
	if (newFiles['package-lock.json']) {
		delete newFiles['package-lock.json']
	}
	if (newFiles['yarn.lock']) {
		delete newFiles['yarn.lock']
	}
	return files
}

export function onlyStaticDirectory(files: Files) {
	function matcher(filePath: string) {
		return !filePath.startsWith('static')
	}

	return excludeFiles(files, matcher)
}

export function normalizePackageJson(defaultPackageJson: PackageJson = {}) {
	const dependencies: { [key: string]: string } = {}
	const devDependencies: { [key: string]: string } = {
		...defaultPackageJson.dependencies,
		...defaultPackageJson.devDependencies,
	}

	if (devDependencies.react) {
		dependencies.react = devDependencies.react
		delete devDependencies.react
	}

	if (devDependencies['react-dom']) {
		dependencies['react-dom'] = devDependencies['react-dom']
		delete devDependencies['react-dom']
	}

	return {
		...defaultPackageJson,
		dependencies: {
			// react and react-dom can be overwritten
			react: 'latest',
			'react-dom': 'latest',
			...dependencies, // override react if user provided it
			// next-server is forced to canary
			'next-server': 'v7.0.2-canary.49',
		},
		devDependencies: {
			...devDependencies,
			// next is forced to canary
			next: 'v7.0.2-canary.49',
			// next-server is a dependency here
			'next-server': undefined,
		},
		scripts: {
			...defaultPackageJson.scripts,
			'now-build':
				'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
		},
	}
}
