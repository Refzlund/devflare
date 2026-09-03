import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const githubApiBaseUrl = process.env.GITHUB_API_URL?.trim() ||
	"https://api.github.com";

class GitHubRequestError extends Error {
	constructor(method, path, status, responseText) {
		super(
			`GitHub API ${method} ${path} failed (${status}): ${responseText}`,
		);
		this.name = "GitHubRequestError";
		this.method = method;
		this.path = path;
		this.status = status;
		this.responseText = responseText;
	}
}

function getInputEnvironmentKeys(name) {
	const normalizedName = name.replace(/ /g, "_").toUpperCase();
	return [
		...new Set([
			`INPUT_${normalizedName}`,
			`INPUT_${normalizedName.replace(/-/g, "_")}`,
		]),
	];
}

export function getInput(name) {
	for (const envKey of getInputEnvironmentKeys(name)) {
		const value = process.env[envKey];
		if (typeof value !== "undefined") {
			return value;
		}
	}

	return "";
}

function getOptionalInput(name) {
	const value = getInput(name).trim();
	return value ? value : undefined;
}

function getBooleanInput(name, fallback = false) {
	const value = getInput(name).trim().toLowerCase();
	if (!value) {
		return fallback;
	}

	return value === "true" || value === "1" || value === "yes" ||
		value === "on";
}

function slugify(value) {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return normalized || "devflare-feedback";
}

function truncate(value, maxLength) {
	if (value.length <= maxLength) {
		return value;
	}

	if (maxLength <= 1) {
		return "…";
	}

	return `${value.slice(0, maxLength - 1)}…`;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shortSha(value) {
	return value.length <= 12 ? value : value.slice(0, 12);
}

function toLink(url, label) {
	return `[${label}](${url})`;
}

function sanitizeCodeFenceContent(value) {
	return value.replaceAll("```", "``\u200b`");
}

function setOutput(name, value) {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath) {
		return;
	}

	appendFileSync(outputPath, `${name}=${value ?? ""}\n`);
}

function log(message) {
	console.log(`[devflare-github-feedback] ${message}`);
}

function warn(message) {
	console.warn(`[devflare-github-feedback] ${message}`);
}

function parseNumber(value) {
	if (!value) {
		return undefined;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseRepository() {
	const repository = process.env.GITHUB_REPOSITORY?.trim();
	if (!repository || !repository.includes("/")) {
		throw new Error("GITHUB_REPOSITORY is not available");
	}

	const [owner, repo] = repository.split("/", 2);
	return {
		owner,
		repo,
	};
}

function getDefaultRunUrl() {
	const serverUrl = process.env.GITHUB_SERVER_URL?.trim();
	const repository = process.env.GITHUB_REPOSITORY?.trim();
	const runId = process.env.GITHUB_RUN_ID?.trim();
	if (!serverUrl || !repository || !runId) {
		return undefined;
	}

	return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function parsePayload(payload) {
	if (!payload) {
		return {};
	}

	if (typeof payload === "string") {
		try {
			return JSON.parse(payload);
		} catch {
			return {};
		}
	}

	if (typeof payload === "object") {
		return payload;
	}

	return {};
}

function getStatusPresentation(config) {
	if (config.operation === "cleanup" || config.status === "inactive") {
		return {
			emoji: "🧹",
			suffix: "retired",
		};
	}

	switch (config.status) {
		case "success": {
			return {
				emoji: "✅",
				suffix: "deployed successfully",
			};
		}

		case "skipped": {
			return {
				emoji: "⏭️",
				suffix: "was unchanged",
			};
		}

		case "failure": {
			return {
				emoji: "❌",
				suffix: "failed",
			};
		}

		case "in_progress": {
			return {
				emoji: "⏳",
				suffix: "is running",
			};
		}

		default: {
			throw new Error(`Unsupported feedback status: ${config.status}`);
		}
	}
}

function buildSummary(config) {
	if (config.summary) {
		return config.summary;
	}

	if (config.operation === "cleanup" || config.status === "inactive") {
		return config.deploymentKind === "production"
			? "This deployment feedback was retired after the related lifecycle completed."
			: "This preview was retired after the related pull request or branch lifecycle completed.";
	}

	if (config.status === "failure") {
		return config.deploymentKind === "production"
			? "The production deployment failed before Devflare could confirm a healthy result."
			: "The preview deployment failed before Devflare could confirm a healthy result.";
	}

	if (config.status === "skipped") {
		return config.deploymentKind === "production"
			? "No new production deployment was needed for this run, so the latest verified production state remains in place."
			: "No new preview deployment was needed for this run, so the existing stable preview remains in place.";
	}

	if (config.status === "in_progress") {
		return "GitHub has accepted the deployment request and the latest run is still in progress.";
	}

	return config.deploymentKind === "production"
		? "Devflare verified the latest production deployment through Cloudflare control-plane checks."
		: "Devflare verified the latest preview deployment through Cloudflare control-plane checks.";
}

function buildCommentHeading(config, headingLevel = 2) {
	const presentation = getStatusPresentation(config);
	return `${
		"#".repeat(headingLevel)
	} ${presentation.emoji} ${config.title} ${presentation.suffix}`;
}

export function buildCommentBody(
	config,
	{ includeMarker = true, headingLevel = 2 } = {},
) {
	const lines = [
		...(includeMarker ? [config.commentMarker] : []),
		buildCommentHeading(config, headingLevel),
		"",
		buildSummary(config),
		"",
	];

	const previewUrl = config.previewUrl ?? config.environmentUrl;
	const productionUrl = config.deploymentKind === "production"
		? config.productionUrl
		: undefined;

	if (previewUrl) {
		lines.push(
			`- ${
				config.operation === "cleanup" || config.status === "inactive"
					? "Last preview URL"
					: "Preview URL"
			}: ${toLink(previewUrl, previewUrl)}`,
		);
	}

	if (productionUrl) {
		lines.push(`- Production URL: ${toLink(productionUrl, productionUrl)}`);
	}

	if (config.versionId) {
		lines.push(`- Version ID: \`${config.versionId}\``);
	}

	if (config.environment) {
		lines.push(`- GitHub environment: \`${config.environment}\``);
	}

	if (config.refName) {
		lines.push(`- Ref: \`${config.refName}\``);
	}

	if (config.sha) {
		lines.push(`- Commit: \`${shortSha(config.sha)}\``);
	}

	if (config.logUrl) {
		lines.push(`- Workflow run: ${toLink(config.logUrl, "View run")}`);
	}

	const detailLines = [];
	if (config.logUrl) {
		detailLines.push(
			`- Full workflow logs: ${toLink(config.logUrl, config.logUrl)}`,
		);
	}

	if (config.logExcerpt) {
		detailLines.push(
			"",
			"```text",
			sanitizeCodeFenceContent(config.logExcerpt),
			"```",
		);
	}

	if (config.detailsMarkdown) {
		detailLines.push("", config.detailsMarkdown);
	}

	if (detailLines.length > 0) {
		lines.push(
			"",
			"<details>",
			"<summary>Logs and details</summary>",
			"",
			...detailLines,
			"",
			"</details>",
		);
	}

	return `${lines.join("\n").trim()}\n`;
}

function usesGroupedComment(config) {
	return Boolean(config.commentSectionKey);
}

function getCommentGroupTitle(config) {
	return config.commentGroupTitle ?? "Deployment status";
}

function getCommentGroupSummary(config) {
	return config.commentGroupSummary ??
		"This single comment tracks the latest deployment feedback for this pull request and is updated in place by the related Devflare workflows.";
}

function getCommentSectionStartMarker(commentKey, sectionKey) {
	return `<!-- devflare-feedback-section:${commentKey}:${sectionKey}:start -->`;
}

function getCommentSectionEndMarker(commentKey, sectionKey) {
	return `<!-- devflare-feedback-section:${commentKey}:${sectionKey}:end -->`;
}

export function parseGroupedCommentSections(commentKey, body) {
	const sections = new Map();
	if (!body) {
		return sections;
	}

	const escapedCommentKey = escapeRegExp(commentKey);
	const pattern = new RegExp(
		`<!-- devflare-feedback-section:${escapedCommentKey}:([^:]+):start -->\\s*([\\s\\S]*?)\\s*<!-- devflare-feedback-section:${escapedCommentKey}:\\1:end -->`,
		"g",
	);

	for (const match of body.matchAll(pattern)) {
		const sectionKey = match[1];
		const sectionBody = match[2]?.trim();
		if (sectionKey && sectionBody) {
			sections.set(sectionKey, sectionBody);
		}
	}

	return sections;
}

export function buildGroupedCommentBody(config, sections) {
	const orderedSections = [...sections.entries()].sort((
		[leftKey],
		[rightKey],
	) => leftKey.localeCompare(rightKey));
	const lines = [
		config.commentMarker,
		`## ${getCommentGroupTitle(config)}`,
		"",
		getCommentGroupSummary(config),
	];

	for (const [sectionKey, sectionBody] of orderedSections) {
		lines.push(
			"",
			getCommentSectionStartMarker(config.commentKey, sectionKey),
			sectionBody.trim(),
			getCommentSectionEndMarker(config.commentKey, sectionKey),
		);
	}

	return `${lines.join("\n").trim()}\n`;
}

function sortCommentsById(comments) {
	return [...comments].sort((left, right) => {
		const leftId = Number(left?.id ?? 0);
		const rightId = Number(right?.id ?? 0);
		return leftId - rightId;
	});
}

function buildGroupedCommentSectionBody(config) {
	return buildCommentBody(config, {
		includeMarker: false,
		headingLevel: 3,
	}).trim();
}

function mergeGroupedCommentSections(config, comments) {
	const sections = new Map();
	for (const comment of sortCommentsById(comments)) {
		for (
			const [sectionKey, sectionBody] of parseGroupedCommentSections(
				config.commentKey,
				comment.body,
			)
		) {
			sections.set(sectionKey, sectionBody);
		}
	}

	sections.set(
		config.commentSectionKey,
		buildGroupedCommentSectionBody(config),
	);
	return sections;
}

function buildDeploymentDescription(config) {
	if (config.operation === "cleanup" || config.status === "inactive") {
		return truncate(`${config.title} retired`, 140);
	}

	switch (config.status) {
		case "success": {
			return truncate(`${config.title} deployed successfully`, 140);
		}

		case "skipped": {
			return truncate(`${config.title} was unchanged`, 140);
		}

		case "failure": {
			return truncate(`${config.title} failed`, 140);
		}

		case "in_progress": {
			return truncate(`${config.title} is running`, 140);
		}

		default: {
			return truncate(`${config.title} updated`, 140);
		}
	}
}

function mapDeploymentStatus(status) {
	switch (status) {
		case "success":
		case "failure":
		case "in_progress":
		case "inactive": {
			return status;
		}

		default: {
			throw new Error(`Unsupported deployment status: ${status}`);
		}
	}
}

function parseGitHubErrorMessage(responseText) {
	if (!responseText) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(responseText);
		return typeof parsed?.message === "string" ? parsed.message : undefined;
	} catch {
		return undefined;
	}
}

function isCommentPermissionError(error) {
	if (!(error instanceof GitHubRequestError)) {
		return false;
	}

	if (error.status !== 403) {
		return false;
	}

	if (!error.path.includes("/issues/") || !error.path.includes("/comments")) {
		return false;
	}

	const message = parseGitHubErrorMessage(error.responseText);
	return message === "Resource not accessible by integration";
}

function toErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

async function githubRequest(token, method, path, body) {
	const response = await fetch(`${githubApiBaseUrl}${path}`, {
		method,
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${token}`,
			"user-agent": "devflare-github-feedback",
			"x-github-api-version": "2022-11-28",
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (response.status === 204) {
		return null;
	}

	const text = await response.text();
	if (!response.ok) {
		throw new GitHubRequestError(method, path, response.status, text);
	}

	return text ? JSON.parse(text) : null;
}

async function resolvePrNumber(config) {
	if (config.prNumber) {
		return config.prNumber;
	}

	if (!config.resolvePrFromRef || !config.refName) {
		return undefined;
	}

	const query = new URLSearchParams({
		state: "open",
		head: `${config.owner}:${config.refName}`,
		per_page: "1",
	});
	const pulls = await githubRequest(
		config.githubToken,
		"GET",
		`/repos/${config.owner}/${config.repo}/pulls?${query.toString()}`,
	);

	if (!Array.isArray(pulls) || pulls.length === 0) {
		log(`No open pull request found for ${config.refName}, skipping PR comment update`);
		return undefined;
	}

	const number = pulls[0]?.number;
	return typeof number === "number" && number > 0 ? number : undefined;
}

async function listMatchingPrComments(config, prNumber) {
	const comments = await githubRequest(
		config.githubToken,
		"GET",
		`/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments?per_page=100`,
	);

	return Array.isArray(comments)
		? sortCommentsById(
			comments.filter(
				(comment) =>
					typeof comment.body === "string" &&
					comment.body.includes(config.commentMarker),
			),
		)
		: [];
}

async function updatePrComment(config, commentId, body, prNumber) {
	const updated = await githubRequest(
		config.githubToken,
		"PATCH",
		`/repos/${config.owner}/${config.repo}/issues/comments/${commentId}`,
		{ body },
	);
	log(`Updated PR comment #${commentId} on pull request #${prNumber}`);
	return updated?.id ?? commentId;
}

async function createPrComment(config, prNumber, body) {
	const created = await githubRequest(
		config.githubToken,
		"POST",
		`/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments`,
		{ body },
	);
	log(`Created PR comment on pull request #${prNumber}`);
	return created?.id;
}

async function deletePrComment(config, commentId) {
	await githubRequest(
		config.githubToken,
		"DELETE",
		`/repos/${config.owner}/${config.repo}/issues/comments/${commentId}`,
	);
	log(`Deleted duplicate PR comment #${commentId}`);
}

async function dedupePrComments(config, prNumber, body) {
	const matchingComments = await listMatchingPrComments(config, prNumber);
	if (matchingComments.length === 0) {
		return undefined;
	}

	const [canonicalComment, ...duplicateComments] = matchingComments;
	let commentId = canonicalComment.id;
	if (canonicalComment.body !== body) {
		commentId = await updatePrComment(
			config,
			canonicalComment.id,
			body,
			prNumber,
		);
	}

	for (const duplicateComment of duplicateComments) {
		if (duplicateComment.id === canonicalComment.id) {
			continue;
		}

		await deletePrComment(config, duplicateComment.id);
	}

	return commentId;
}

async function upsertPrComment(config, prNumber) {
	const matchingComments = await listMatchingPrComments(config, prNumber);

	if (usesGroupedComment(config)) {
		const body = buildGroupedCommentBody(
			config,
			mergeGroupedCommentSections(config, matchingComments),
		);

		if (matchingComments.length > 0) {
			const [canonicalComment] = matchingComments;
			await updatePrComment(config, canonicalComment.id, body, prNumber);
			return await dedupePrComments(config, prNumber, body);
		}

		await createPrComment(config, prNumber, body);
		const mergedBody = buildGroupedCommentBody(
			config,
			mergeGroupedCommentSections(
				config,
				await listMatchingPrComments(config, prNumber),
			),
		);
		return await dedupePrComments(config, prNumber, mergedBody);
	}

	const body = buildCommentBody(config);
	if (matchingComments.length > 0) {
		const [canonicalComment] = matchingComments;
		await updatePrComment(config, canonicalComment.id, body, prNumber);
		return await dedupePrComments(config, prNumber, body);
	}

	await createPrComment(config, prNumber, body);
	return await dedupePrComments(config, prNumber, body);
}

async function createDeployment(config) {
	if (!config.refName && !config.sha) {
		throw new Error("Deployment feedback requires ref-name or sha");
	}

	const deployment = await githubRequest(
		config.githubToken,
		"POST",
		`/repos/${config.owner}/${config.repo}/deployments`,
		{
			ref: config.sha ?? config.refName,
			task: config.deploymentKind === "production"
				? "deploy"
				: "deploy:preview",
			auto_merge: false,
			required_contexts: [],
			environment: config.environment,
			description: buildDeploymentDescription(config),
			transient_environment: config.transientEnvironment,
			production_environment: config.productionEnvironment,
			payload: {
				commentKey: config.commentKey,
				deploymentKind: config.deploymentKind,
				refName: config.refName,
				title: config.title,
			},
		},
	);

	await githubRequest(
		config.githubToken,
		"POST",
		`/repos/${config.owner}/${config.repo}/deployments/${deployment.id}/statuses`,
		{
			state: mapDeploymentStatus(config.status),
			environment: config.environment,
			environment_url: config.environmentUrl,
			log_url: config.logUrl,
			description: buildDeploymentDescription(config),
			auto_inactive: config.status === "success",
		},
	);

	log(`Created deployment ${deployment.id} for ${config.environment}`);
	return deployment.id;
}

function matchesCleanupTarget(config, deployment) {
	if (config.environment && deployment.environment !== config.environment) {
		return false;
	}

	const payload = parsePayload(deployment.payload);
	if (
		config.refName && payload.refName && payload.refName !== config.refName
	) {
		return false;
	}

	if (
		config.commentKey && payload.commentKey &&
		payload.commentKey !== config.commentKey
	) {
		return false;
	}

	if (config.refName && payload.refName === config.refName) {
		return true;
	}

	if (config.commentKey && payload.commentKey === config.commentKey) {
		return true;
	}

	return Boolean(config.environment);
}

async function deactivateDeployments(config) {
	if (!config.environment && !config.refName && !config.commentKey) {
		throw new Error(
			"Deployment cleanup requires environment, ref-name, or comment-key to find existing deployments",
		);
	}

	const query = new URLSearchParams({
		per_page: "100",
		...(config.environment ? { environment: config.environment } : {}),
	});
	const deployments = await githubRequest(
		config.githubToken,
		"GET",
		`/repos/${config.owner}/${config.repo}/deployments?${query.toString()}`,
	);
	const matchingDeployments = Array.isArray(deployments)
		? deployments.filter((deployment) =>
			matchesCleanupTarget(config, deployment)
		)
		: [];

	if (matchingDeployments.length === 0) {
		log("No matching deployments found to retire");
		return undefined;
	}

	let lastDeploymentId;
	for (const deployment of matchingDeployments) {
		await githubRequest(
			config.githubToken,
			"POST",
			`/repos/${config.owner}/${config.repo}/deployments/${deployment.id}/statuses`,
			{
				state: "inactive",
				environment: config.environment,
				environment_url: config.environmentUrl,
				log_url: config.logUrl,
				description: buildDeploymentDescription(config),
			},
		);
		lastDeploymentId = deployment.id;
	}

	log(`Marked ${matchingDeployments.length} deployment(s) inactive`);
	return lastDeploymentId;
}

export function buildConfig() {
	const { owner, repo } = parseRepository();
	const githubToken = getOptionalInput("github-token");
	if (!githubToken) {
		throw new Error("github-token is required");
	}

	const title = getOptionalInput("title");
	if (!title) {
		throw new Error("title is required");
	}

	const deploymentKind = getOptionalInput("deployment-kind") ?? "preview";
	const commentKey = getOptionalInput("comment-key") ?? slugify(title);
	const commentSectionKeyInput = getOptionalInput("comment-section-key");
	const previewUrl = getOptionalInput("preview-url");
	const productionUrl = deploymentKind === "production"
		? getOptionalInput("production-url")
		: undefined;
	const environmentUrl = getOptionalInput("environment-url") ??
		(deploymentKind === "production" ? productionUrl : previewUrl);
	const environment = getOptionalInput("environment") ?? title;
	const refName = getOptionalInput("ref-name");
	const sha = getOptionalInput("sha");
	const mode = getOptionalInput("mode") ?? "comment";
	const operation = getOptionalInput("operation") ?? "report";
	const status = getOptionalInput("status");
	if (!status) {
		throw new Error("status is required");
	}

	return {
		owner,
		repo,
		githubToken,
		title,
		commentKey,
		commentMarker: `<!-- devflare-feedback:${commentKey} -->`,
		commentSectionKey: commentSectionKeyInput
			? slugify(commentSectionKeyInput)
			: undefined,
		commentGroupTitle: getOptionalInput("comment-group-title"),
		commentGroupSummary: getOptionalInput("comment-group-summary"),
		mode,
		operation,
		status,
		deploymentKind,
		prNumber: parseNumber(getOptionalInput("pr-number")),
		resolvePrFromRef: getBooleanInput("resolve-pr-from-ref"),
		refName,
		sha,
		environment,
		environmentUrl,
		previewUrl,
		productionUrl,
		versionId: getOptionalInput("version-id"),
		logUrl: getOptionalInput("log-url") ?? getDefaultRunUrl(),
		logExcerpt: getOptionalInput("log-excerpt"),
		summary: getOptionalInput("summary"),
		detailsMarkdown: getOptionalInput("details-markdown"),
		transientEnvironment: getBooleanInput(
			"transient-environment",
			deploymentKind !== "production",
		),
		productionEnvironment: getBooleanInput(
			"production-environment",
			deploymentKind === "production",
		),
		ignoreCommentPermissionErrors: getBooleanInput(
			"ignore-comment-permission-errors",
			true,
		),
	};
}

function wantsComment(config) {
	return config.mode === "comment" || config.mode === "both";
}

function wantsDeployment(config) {
	return config.mode === "deployment" || config.mode === "both";
}

async function runCommentFeedback(config) {
	const resolvedPrNumber = await resolvePrNumber(config);
	if (resolvedPrNumber) {
		return {
			resolvedPrNumber,
			commentId: await upsertPrComment(config, resolvedPrNumber),
		};
	}

	if (config.resolvePrFromRef && config.refName) {
		log("Skipping PR comment because no matching open pull request was found");
		return {
			resolvedPrNumber,
			commentId: undefined,
		};
	}

	throw new Error(
		"Comment feedback requires pr-number or resolve-pr-from-ref with ref-name",
	);
}

function handleCommentFeedbackFailure(config, error, failures) {
	if (
		config.ignoreCommentPermissionErrors && isCommentPermissionError(error)
	) {
		warn(
			"Skipping PR comment update because the current GitHub token cannot write issue comments for this run (403 Resource not accessible by integration)",
		);
		return;
	}

	failures.push(toErrorMessage(error));
}

async function runDeploymentFeedback(config) {
	if (config.status === "skipped") {
		throw new Error(
			'Deployment feedback does not support status "skipped". Use comment mode when no deployment update is needed.',
		);
	}

	return config.operation === "cleanup" || config.status === "inactive"
		? await deactivateDeployments(config)
		: await createDeployment(config);
}

function writeActionOutputs({ commentId, deploymentId, resolvedPrNumber }) {
	setOutput("comment-id", commentId ?? "");
	setOutput("deployment-id", deploymentId ?? "");
	setOutput("pr-number", resolvedPrNumber ?? "");
}

export async function main() {
	const config = buildConfig();
	const failures = [];
	let resolvedPrNumber = config.prNumber;
	let commentId;
	let deploymentId;

	if (wantsComment(config)) {
		try {
			const commentFeedback = await runCommentFeedback(config);
			resolvedPrNumber = commentFeedback.resolvedPrNumber;
			commentId = commentFeedback.commentId;
		} catch (error) {
			handleCommentFeedbackFailure(config, error, failures);
		}
	}

	if (wantsDeployment(config)) {
		try {
			deploymentId = await runDeploymentFeedback(config);
		} catch (error) {
			failures.push(toErrorMessage(error));
		}
	}

	writeActionOutputs({
		commentId,
		deploymentId,
		resolvedPrNumber,
	});

	if (failures.length > 0) {
		throw new Error(failures.join("\n"));
	}
}

if (
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await main();
}
