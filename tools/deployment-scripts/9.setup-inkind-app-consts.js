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
const { selectDeploymentFile, DEPLOYMENT_DIR } = require('./lib/select-deployment-file');
const { maybeSkipStep } = require('./lib/skip-step');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
const SETTING_NAME = 'INKIND_APP_CONSTS';

const ID_TYPE_LABELS = [
	{ title: 'Citizenship (Nagarikta)', value: 'citizenship' },
	{ title: 'License', value: 'license' },
	{ title: 'National ID (NID)', value: 'nid' },
	{ title: 'SSA ID', value: 'ssa' },
	{ title: 'Other', value: 'other' },
];

const OTP_SKIP_REASONS = [
	'No Network',
	'Shared Phone Access/Ownership',
	'Forgot Mobile Phone',
	'Incorrect Phone Number Registered',
	'Mobile Phone Damaged',
	'OTP Not Received',
	'Mobile Phone Lost',
	'SMS Storage Full',
	'Other',
];

const PRESETS = {
	FLOOD: {
		idTypeLabels: ID_TYPE_LABELS,
		otpSkipReasons: OTP_SKIP_REASONS,
		vulnerabilityGistData: [
			'Displacement',
			'Loss of livelihood',
			'Food insecurity',
			'Water contamination',
			'Health risk',
			'Others',
		],
	},
	HEATWAVE: {
		idTypeLabels: ID_TYPE_LABELS,
		otpSkipReasons: OTP_SKIP_REASONS,
		vulnerabilityGistData: [
			'Heat stress',
			'Dehydration',
			'Elderly vulnerability',
			'Child vulnerability',
			'Livestock loss',
			'Others',
		],
	},
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

async function askProjectType() {
	const { projectType } = await prompt([
		{
			type: 'list',
			name: 'projectType',
			message: 'Select project type:',
			choices: Object.keys(PRESETS).map((k) => ({ name: k, value: k })),
		},
	]);
	return projectType;
}

async function main() {
	const selectedFile = await selectDeploymentFile();
	await maybeSkipStep('Step 9: Inkind app consts');
	const projectType = await askProjectType();
	const value = PRESETS[projectType];
	const confirmed = await confirmSelection(selectedFile, value);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const entry = buildSettingEntry(value);
	const action = await updateDeploymentFile(selectedFile, entry);
	console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update INKIND_APP_CONSTS in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
