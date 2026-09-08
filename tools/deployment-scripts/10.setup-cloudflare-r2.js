/**
 * 10.setup-cloudflare-r2.js
 *
 * Step 10 of the deployment setup workflow.
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
 *   - Obtain credentials from your Cloudflare R2 dashboard
 *
 * Usage:
 *   node tools/deployment-scripts/10.setup-cloudflare-r2.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const { selectDeploymentFile, DEPLOYMENT_DIR } = require('./lib/select-deployment-file');
const { maybeSkipStep } = require('./lib/skip-step');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
const SETTING_NAME = 'CLOUDFLARE_R2';

function buildSettingEntry(config) {
	return {
		name: SETTING_NAME,
		value: JSON.stringify(config),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
	};
}

async function askR2Values() {
	return prompt([
		{
			type: 'input',
			name: 'R2_ACCOUNT_ID',
			message: 'Enter R2 Account ID:',
			validate: (v) => v.trim() ? true : 'Required.',
			filter: (v) => v.trim(),
		},
		{
			type: 'input',
			name: 'R2_ACCESS_KEY_ID',
			message: 'Enter R2 Access Key ID:',
			validate: (v) => v.trim() ? true : 'Required.',
			filter: (v) => v.trim(),
		},
		{
			type: 'password',
			name: 'R2_SECRET_ACCESS_KEY',
			message: 'Enter R2 Secret Access Key:',
			mask: '*',
			validate: (v) => v.trim() ? true : 'Required.',
			filter: (v) => v.trim(),
		},
		{
			type: 'input',
			name: 'R2_BUCKET',
			message: 'Enter R2 Bucket name:',
			validate: (v) => v.trim() ? true : 'Required.',
			filter: (v) => v.trim(),
		},
		{
			type: 'input',
			name: 'R2_PUBLIC_DOMAIN',
			message: 'Enter R2 Public Domain:',
			validate: (v) => v.trim() ? true : 'Required.',
			filter: (v) => v.trim(),
		},
	]);
}

async function confirmSelection(selectedFile, config) {
	console.log('\nSelected CLOUDFLARE_R2 values:');
	console.log(JSON.stringify(config, null, 2));

	const { confirmed } = await prompt([
		{
			type: 'confirm',
			name: 'confirmed',
			message: `Apply this setting to ${selectedFile}?`,
			default: true,
		},
	]);

	return confirmed;
}

async function updateDeploymentFile(fileName, entry) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];
	const existingIndex = settings.findIndex(
		(s) => s && s.name === SETTING_NAME
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
	const selectedFile = await selectDeploymentFile();
	await maybeSkipStep('Step 10: Cloudflare R2');
	const config = await askR2Values();
	const confirmed = await confirmSelection(selectedFile, config);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const entry = buildSettingEntry(config);
	const action = await updateDeploymentFile(selectedFile, entry);
	console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update CLOUDFLARE_R2 in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
