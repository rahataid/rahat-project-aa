/**
 * 6.setup-offramp-settings.js
 *
 * Step 6 of the deployment setup workflow.
 *
 * Configures the OFFRAMP_SETTINGS for a project deployment file.
 * Off-ramp settings allow the project to connect to an external payment
 * off-ramp service for converting crypto disbursements to local currency.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Prompts for the off-ramp service URL, App ID, and Access Token
 *   - Upserts the OFFRAMP_SETTINGS entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *   - Obtain the URL, APPID, and ACCESSTOKEN from your off-ramp service provider
 *
 * Usage:
 *   node tools/deployment-scripts/6.setup-offramp-settings.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const { selectDeploymentFile, DEPLOYMENT_DIR } = require('./lib/select-deployment-file');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
const SETTING_NAME = 'OFFRAMP_SETTINGS';

function buildOfframpEntry(config) {
	return {
		name: SETTING_NAME,
		value: JSON.stringify(config),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
	};
}


async function askOfframpValues() {
	const answers = await prompt([
		{
			type: 'input',
			name: 'URL',
			message: 'Enter OFFRAMP URL:',
			default: 'https://api-offramp-dev.rahat.io/v1',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'URL is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'APPID',
			message: 'Enter OFFRAMP APPID:',
			default: 'f3af9d3a-3e6e-4542-b768-d9758a4fe750',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'APPID is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'ACCESSTOKEN',
			message: 'Enter OFFRAMP ACCESSTOKEN:',
			default: 'sk_test_1234567890',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'ACCESSTOKEN is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
	]);

	return answers;
}

async function confirmSelection(selectedFile, config) {
	console.log('\nSelected OFFRAMP_SETTINGS value:');
	console.log(JSON.stringify(config, null, 2));

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
	const selectedFile = await selectDeploymentFile();
	const config = await askOfframpValues();
	const confirmed = await confirmSelection(selectedFile, config);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const entry = buildOfframpEntry(config);
	const action = await updateDeploymentFile(selectedFile, entry);
	console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update OFFRAMP_SETTINGS in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
