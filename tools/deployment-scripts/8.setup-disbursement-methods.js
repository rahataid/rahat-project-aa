/**
 * 8.setup-disbursement-methods.js
 *
 * Step 8 of the deployment setup workflow.
 *
 * Configures the DISBURSHMENT_METHODS setting by prompting the user to select
 * which disbursement methods to enable for the project, then writes the setting
 * to the selected deployment JSON file.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Asks which disbursement methods to enable (GROUP_TOKEN, TOKEN, INKIND)
 *   - Upserts the DISBURSHMENT_METHODS setting into the deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/8.setup-disbursement-methods.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const SETTING_NAME = 'DISBURSHMENT_METHODS';

const DISBURSEMENT_METHOD_CHOICES = [
	{ label: 'Group Token', value: 'GROUP_TOKEN' },
	{ label: 'Token', value: 'TOKEN' },
	{ label: 'In-Kind', value: 'INKIND' },
];

function buildSettingEntry(selectedMethods) {
	return {
		name: SETTING_NAME,
		value: JSON.stringify(selectedMethods),
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

async function askDisbursementMethods() {
	const answers = await prompt([
		{
			type: 'checkbox',
			name: 'selectedMethods',
			message: 'Select disbursement methods to enable:',
			choices: DISBURSEMENT_METHOD_CHOICES.map((method) => ({
				name: method.label,
				value: method.value,
				checked: true,
			})),
			validate: (selected) =>
				selected.length > 0 ? true : 'Select at least one disbursement method.',
		},
	]);

	return answers.selectedMethods;
}

async function confirmSelection(selectedFile, selectedMethods) {
	console.log('\nSelected disbursement methods:');
	console.log(JSON.stringify(selectedMethods, null, 2));

	const answers = await prompt([
		{
			type: 'confirm',
			name: 'confirmed',
			message: `Apply ${SETTING_NAME} to ${selectedFile}?`,
			default: true,
		},
	]);

	return answers.confirmed;
}

async function updateDeploymentFile(fileName, setting) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];

	const existingIndex = settings.findIndex((s) => s && s.name === setting.name);

	if (existingIndex >= 0) {
		settings[existingIndex] = setting;
	} else {
		settings.push(setting);
	}

	payload.settings = settings;
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
	const deploymentFiles = await getDeploymentFiles();

	if (!deploymentFiles.length) {
		throw new Error(`No deployment files found in ${DEPLOYMENT_DIR}`);
	}

	const selectedFile = await askTargetFile(deploymentFiles);
	const selectedMethods = await askDisbursementMethods();
	const confirmed = await confirmSelection(selectedFile, selectedMethods);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const setting = buildSettingEntry(selectedMethods);
	await updateDeploymentFile(selectedFile, setting);

	console.log(`UPDATED: ${selectedFile}`);
	console.log(`UPDATED SETTINGS: ${SETTING_NAME}`);
}

main().catch((error) => {
	console.error('Failed to update disbursement methods in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
