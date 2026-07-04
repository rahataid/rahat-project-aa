/**
 * 9.setup-inkind-app-consts.js
 *
 * Step 9 of the deployment setup workflow.
 *
 * Seeds the INKIND_APP_CONSTS setting (idTypeLabels, otpSkipReasons,
 * vulnerabilityGistData) into a project deployment file.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Upserts the INKIND_APP_CONSTS entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/9.setup-inkind-app-consts.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const SETTING_NAME = 'INKIND_APP_CONSTS';

const INKIND_APP_CONSTS_VALUE = {
	idTypeLabels: [{ title: 'Citizenship (Nagarikta)', value: 'citizenship' }],
	otpSkipReasons: ['No Network'],
	vulnerabilityGistData: ['Displacement'],
};

function buildSettingEntry(value) {
	return {
		name: SETTING_NAME,
		value: JSON.stringify(value),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
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

async function confirmSelection(selectedFile, value) {
	console.log('\nSelected INKIND_APP_CONSTS value:');
	console.log(JSON.stringify(value, null, 2));

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
	const confirmed = await confirmSelection(selectedFile, INKIND_APP_CONSTS_VALUE);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const entry = buildSettingEntry(INKIND_APP_CONSTS_VALUE);
	const action = await updateDeploymentFile(selectedFile, entry);
	console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update INKIND_APP_CONSTS in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
