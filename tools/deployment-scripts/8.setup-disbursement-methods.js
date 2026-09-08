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
const { selectDeploymentFile, DEPLOYMENT_DIR } = require('./lib/select-deployment-file');
const { maybeSkipStep } = require('./lib/skip-step');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
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
	const selectedFile = await selectDeploymentFile();
	await maybeSkipStep('Step 8: Disbursement methods');
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
