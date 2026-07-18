/**
 * 9.setup-cloudflare-r2.js
 *
 * Step 9 of the deployment setup workflow.
 *
 * Configures the CLOUDFLARE_R2 setting for a project deployment file.
 * Cloudflare R2 is used as object storage for generated assets (e.g. QR PDFs).
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Prompts for R2 account ID, access key ID, secret access key, bucket, and public domain
 *   - Upserts the CLOUDFLARE_R2 entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *   - Obtain the account ID, access key ID, secret access key, bucket, and public
 *     domain from your Cloudflare R2 dashboard
 *
 * Usage:
 *   node tools/deployment-scripts/9.setup-cloudflare-r2.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const SETTING_NAME = 'CLOUDFLARE_R2';

function buildR2Entry(config) {
	return {
		name: SETTING_NAME,
		value: JSON.stringify(config),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: true,
	};
}

async function getDeploymentFiles() {
	await fs.mkdir(DEPLOYMENT_DIR, { recursive: true });
	const entries = await fs.readdir(DEPLOYMENT_DIR, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));
}

async function askTargetFile(deploymentFiles) {
	const answers = await prompt([
		{
			type: 'list',
			name: 'selectedFile',
			message: 'Select one deployment file to update:',
			choices: deploymentFiles.map((fileName) => ({
				name: fileName,
				value: fileName,
			})),
		},
	]);

	return answers.selectedFile;
}

async function askR2Values() {
	const answers = await prompt([
		{
			type: 'input',
			name: 'R2_ACCOUNT_ID',
			message: 'Enter R2_ACCOUNT_ID:',
			default: process.env.R2_ACCOUNT_ID || '',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'R2_ACCOUNT_ID is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'password',
			name: 'R2_ACCESS_KEY_ID',
			message: 'Enter R2_ACCESS_KEY_ID:',
			mask: '*',
			default: process.env.R2_ACCESS_KEY_ID || '',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'R2_ACCESS_KEY_ID is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'password',
			name: 'R2_SECRET_ACCESS_KEY',
			message: 'Enter R2_SECRET_ACCESS_KEY:',
			mask: '*',
			default: process.env.R2_SECRET_ACCESS_KEY || '',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'R2_SECRET_ACCESS_KEY is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'R2_BUCKET',
			message: 'Enter R2_BUCKET:',
			default: process.env.R2_BUCKET || 'rahat-qr-pdfs',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'R2_BUCKET is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'R2_PUBLIC_DOMAIN',
			message: 'Enter R2_PUBLIC_DOMAIN:',
			default: process.env.R2_PUBLIC_DOMAIN || '',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'R2_PUBLIC_DOMAIN is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
	]);

	return answers;
}

async function confirmSelection(selectedFile, config) {
	console.log('\nSelected CLOUDFLARE_R2 value:');
	console.log(
		JSON.stringify(
			{
				...config,
				R2_ACCESS_KEY_ID: '********',
				R2_SECRET_ACCESS_KEY: '********',
			},
			null,
			2
		)
	);

	const answers = await prompt([
		{
			type: 'confirm',
			name: 'confirmed',
			message: `Apply this setting to ${selectedFile}?`,
			default: true,
		},
	]);

	return answers.confirmed;
}

async function updateDeploymentFile(fileName, entry) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];
	const existingIndex = settings.findIndex(
		(setting) => setting && setting.name === SETTING_NAME
	);

	if (existingIndex >= 0) {
		settings[existingIndex] = entry;
	} else {
		settings.push(entry);
	}

	payload.settings = settings;
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

	return existingIndex >= 0 ? 'updated' : 'added';
}

async function main() {
	const deploymentFiles = await getDeploymentFiles();

	if (!deploymentFiles.length) {
		throw new Error(`No deployment files found in ${DEPLOYMENT_DIR}`);
	}

	const selectedFile = await askTargetFile(deploymentFiles);
	const config = await askR2Values();
	const confirmed = await confirmSelection(selectedFile, config);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const entry = buildR2Entry(config);
	const action = await updateDeploymentFile(selectedFile, entry);
	console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update CLOUDFLARE_R2 in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
