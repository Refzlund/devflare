import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const ignoredDirectories = new Set([
	".devflare",
	".git",
	".svelte-kit",
	".turbo",
	".wrangler",
	"coverage",
	"dist",
	"node_modules",
]);

const rootDir = process.cwd();

function normalizePath(path) {
	return path.replace(/\\+/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

function parseList(value) {
	if (!value) {
		return [];
	}

	return value
		.split(/\r?\n|,/)
		.map((entry) => normalizePath(entry.trim()))
		.filter(Boolean);
}

function parseArgs(argv) {
	const parsed = {
		targetPackage: "",
		baseRef: "",
		headRef: "",
		extraPaths: [],
		changedFiles: [],
	};

	for (let index = 0; index < argv.length; index += 1) {
		const current = argv[index];
		const next = argv[index + 1];

		if (current === "--target-package" && next) {
			parsed.targetPackage = next;
			index += 1;
			continue;
		}

		if (current === "--base-ref" && next) {
			parsed.baseRef = next;
			index += 1;
			continue;
		}

		if (current === "--head-ref" && next) {
			parsed.headRef = next;
			index += 1;
			continue;
		}

		if (current === "--extra-path" && next) {
			parsed.extraPaths.push(normalizePath(next));
			index += 1;
			continue;
		}

		if (current === "--changed-file" && next) {
			parsed.changedFiles.push(normalizePath(next));
			index += 1;
		}
	}

	return parsed;
}

function writeOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) {
		return;
	}

	const normalized = String(value ?? "");
	if (!/[\r\n]/.test(normalized)) {
		appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${normalized}\n`);
		return;
	}

	const delimiter = `DEVFLARE_${
		name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")
	}_${Date.now()}`;
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		`${name}<<${delimiter}\n${normalized}\n${delimiter}\n`,
	);
}

function git(args, options = {}) {
	return execFileSync("git", args, {
		cwd: rootDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	}).trim();
}

function isZeroSha(value) {
	return /^[0]+$/.test(value);
}

function isMeaningfulRef(value) {
	return Boolean(value) && !isZeroSha(value);
}

function ensureRefAvailable(ref) {
	if (!ref || ref === "HEAD") {
		return;
	}

	try {
		git(["rev-parse", "--verify", `${ref}^{commit}`]);
	} catch {
		try {
			git(["fetch", "--no-tags", "--depth=1", "origin", ref]);
		} catch {
			// ignore here and let the follow-up verification surface a clear error if the ref is still missing
		}

		git(["rev-parse", "--verify", `${ref}^{commit}`]);
	}
}

function escapeRegExp(value) {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(glob) {
	let pattern = "";
	for (let index = 0; index < glob.length; index += 1) {
		const current = glob[index];
		const next = glob[index + 1];

		if (current === "*" && next === "*") {
			pattern += ".*";
			index += 1;
			continue;
		}

		if (current === "*") {
			pattern += "[^/]*";
			continue;
		}

		if (current === "?") {
			pattern += "[^/]";
			continue;
		}

		pattern += escapeRegExp(current);
	}

	return new RegExp(`^${pattern}$`);
}

function matchesAnyPattern(filePath, patterns) {
	return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

function readJson(relativePath) {
	return JSON.parse(readFileSync(join(rootDir, relativePath), "utf8"));
}

function discoverWorkspacePackages() {
	const packages = new Map();

	function walk(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (ignoredDirectories.has(entry.name)) {
					continue;
				}

				walk(join(directory, entry.name));
				continue;
			}

			if (entry.name !== "package.json") {
				continue;
			}

			const absolutePath = join(directory, entry.name);
			const relativePath = normalizePath(relative(rootDir, absolutePath));
			const packageDirectory = normalizePath(
				relative(rootDir, directory),
			);

			if (relativePath === "package.json") {
				continue;
			}

			const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
			if (!manifest.name) {
				continue;
			}

			packages.set(manifest.name, {
				name: manifest.name,
				directory: packageDirectory,
				dependencies: [],
				manifest,
			});
		}
	}

	walk(rootDir);

	for (const pkg of packages.values()) {
		const internalDependencies = new Set();
		for (
			const dependencyField of [
				"dependencies",
				"devDependencies",
				"peerDependencies",
				"optionalDependencies",
			]
		) {
			const dependencyMap = pkg.manifest[dependencyField] ?? {};
			for (const dependencyName of Object.keys(dependencyMap)) {
				if (packages.has(dependencyName)) {
					internalDependencies.add(dependencyName);
				}
			}
		}

		pkg.dependencies = [...internalDependencies];
	}

	return packages;
}

function resolveComparisonRefs(cliArgs) {
	const defaultBranch = process.env.DEVFLARE_DEFAULT_BRANCH?.trim() || "main";
	const eventName = process.env.DEVFLARE_EVENT_NAME?.trim() || "";
	const eventAction = process.env.DEVFLARE_EVENT_ACTION?.trim() || "";
	const pushBefore = process.env.DEVFLARE_PUSH_BEFORE?.trim() || "";
	const pullRequestBaseSha =
		process.env.DEVFLARE_PULL_REQUEST_BASE_SHA?.trim() || "";
	const pullRequestHeadSha =
		process.env.DEVFLARE_PULL_REQUEST_HEAD_SHA?.trim() || "";

	const headRef = cliArgs.headRef || pullRequestHeadSha || "HEAD";
	let baseRef = cliArgs.baseRef;

	if (!baseRef) {
		if (
			eventName === "pull_request" && eventAction === "synchronize" &&
			isMeaningfulRef(pushBefore)
		) {
			baseRef = pushBefore;
		} else if (eventName === "push" && isMeaningfulRef(pushBefore)) {
			baseRef = pushBefore;
		} else if (isMeaningfulRef(pullRequestBaseSha)) {
			baseRef = pullRequestBaseSha;
		}
	}

	ensureRefAvailable(headRef);

	if (isMeaningfulRef(baseRef)) {
		ensureRefAvailable(baseRef);
		return {
			baseRef,
			headRef,
		};
	}

	const defaultBranchRef = `origin/${defaultBranch}`;
	ensureRefAvailable(defaultBranchRef);

	return {
		baseRef: git(["merge-base", headRef, defaultBranchRef]),
		headRef,
	};
}

function resolveChangedFiles(cliArgs, comparison) {
	if (cliArgs.changedFiles.length > 0) {
		return [...new Set(cliArgs.changedFiles.map(normalizePath))];
	}

	const output = git([
		"diff",
		"--name-only",
		"--relative",
		comparison.baseRef,
		comparison.headRef,
	]);
	if (!output) {
		return [];
	}

	return [
		...new Set(
			output.split(/\r?\n/).map((entry) => normalizePath(entry.trim()))
				.filter(Boolean),
		),
	];
}

function main() {
	const cliArgs = parseArgs(process.argv.slice(2));
	const targetPackage = cliArgs.targetPackage ||
		process.env.DEVFLARE_DEPLOY_TARGET?.trim();
	if (!targetPackage) {
		throw new Error(
			"Missing target package. Provide --target-package or DEVFLARE_DEPLOY_TARGET.",
		);
	}

	const extraPaths = [
		...new Set([
			...cliArgs.extraPaths,
			...parseList(process.env.DEVFLARE_EXTRA_PATHS),
		]),
	];
	const rootPackageJson = readJson("package.json");
	const turboConfig = readJson("turbo.json");
	const packages = discoverWorkspacePackages();
	const target = packages.get(targetPackage);

	if (!target) {
		throw new Error(`Could not find workspace package "${targetPackage}".`);
	}

	const comparison = resolveComparisonRefs(cliArgs);
	const changedFiles = resolveChangedFiles(cliArgs, comparison);
	const globalPatterns = [
		...new Set(
			[
				"package.json",
				"turbo.json",
				...(turboConfig.globalDependencies ?? []),
			].map(normalizePath),
		),
	];
	const globalChangedFiles = changedFiles.filter((filePath) =>
		matchesAnyPattern(filePath, globalPatterns)
	);

	for (const pkg of packages.values()) {
		pkg.changedFiles = changedFiles.filter(
			(filePath) =>
				filePath === pkg.directory ||
				filePath.startsWith(`${pkg.directory}/`),
		);
	}

	const changedWorkspaces = [...packages.values()]
		.filter((pkg) => pkg.changedFiles.length > 0)
		.map((pkg) => pkg.name)
		.sort();

	const memo = new Map();

	function evaluatePackage(packageName, stack = new Set()) {
		if (memo.has(packageName)) {
			return memo.get(packageName);
		}

		if (stack.has(packageName)) {
			return {
				shouldDeploy: false,
				reasons: [],
			};
		}

		stack.add(packageName);
		const pkg = packages.get(packageName);
		const reasons = [];

		if (globalChangedFiles.length > 0) {
			reasons.push(
				`global dependency changed (${
					globalChangedFiles.slice(0, 5).join(", ")
				})`,
			);
		}

		if (pkg.changedFiles.length > 0) {
			reasons.push(
				`workspace changed (${
					pkg.changedFiles.slice(0, 5).join(", ")
				})`,
			);
		}

		const matchingExtraPaths = packageName === targetPackage
			? changedFiles.filter((filePath) =>
				extraPaths.some(
					(extraPath) =>
						filePath === extraPath ||
						filePath.startsWith(`${extraPath}/`) ||
						matchesAnyPattern(filePath, [extraPath]),
				)
			)
			: [];

		if (matchingExtraPaths.length > 0) {
			reasons.push(
				`extra dependency path changed (${
					matchingExtraPaths.slice(0, 5).join(", ")
				})`,
			);
		}

		for (const dependencyName of pkg.dependencies) {
			const dependencyResult = evaluatePackage(
				dependencyName,
				new Set(stack),
			);
			if (dependencyResult.shouldDeploy) {
				reasons.push(
					`workspace dependency "${dependencyName}" changed`,
				);
			}
		}

		const result = {
			shouldDeploy: reasons.length > 0,
			reasons,
		};

		memo.set(packageName, result);
		return result;
	}

	const evaluation = evaluatePackage(targetPackage);
	const reason = evaluation.reasons[0] ??
		"no relevant workspace or global dependency changes detected";
	const result = {
		targetPackage,
		shouldDeploy: evaluation.shouldDeploy,
		reason,
		reasons: evaluation.reasons,
		comparisonBase: comparison.baseRef,
		comparisonHead: comparison.headRef,
		changedFiles,
		changedWorkspaces,
		globalDependencies: globalPatterns,
		workspaceDependencies: target.dependencies,
		workspaceRoot: target.directory,
		rootPackageManager: rootPackageJson.packageManager ?? "",
	};

	writeOutput("should-deploy", evaluation.shouldDeploy ? "true" : "false");
	writeOutput("reason", reason);
	writeOutput("comparison-base", comparison.baseRef);
	writeOutput("comparison-head", comparison.headRef);
	writeOutput("changed-workspaces", changedWorkspaces.join(","));
	writeOutput("changed-files", changedFiles.join("\n"));

	console.log(JSON.stringify(result, null, 2));
}

main();
