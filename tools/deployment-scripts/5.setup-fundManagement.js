/**
 * 5.setup-fundManagement.js
 *
 * Step 5 of the deployment setup workflow.
 *
 * Configures the Fund Management section of the project UI by writing the
 * FUNDMANAGEMENT_TAB_CONFIG setting and any additional settings required by
 * the selected optional tabs.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Asks which optional fund management tabs to enable:
 *       - Cash Tracker: also upserts ENTITIES and ENTRY_POINT settings
 *       - Multi-Sig (Gnosis): also upserts SAFE_API_KEY, SAFE_PROPOSER_PRIVATE_ADDRESS,
 *         and SAFE_WALLET settings
 *   - Always includes Tokens Overview and Fund Management List as mandatory tabs
 *   - Upserts all selected settings into the deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/5.setup-fundManagement.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const FUNDMANAGEMENT_TAB_CONFIG_NAME = 'FUNDMANAGEMENT_TAB_CONFIG';

const OPTIONAL_TAB_CHOICES = [
	{ label: 'Cash Tracker', value: 'cashTracker' },
	{ label: 'Multi-Sig (Gnosis)', value: 'multisigWallet' },
];

const MANDATORY_TABS = [
	{ label: 'Tokens Overview', value: 'tokenOverview' },
	{ label: 'Fund Management List', value: 'fundManagementList' },
];

const CASH_TRACKER_ENTITIES = [
	{
		alias: 'UNICEF Nepal CO',
		address: '0xC52e90DB78DeB581D6CB8b5aEBda0802bA8F37B5',
		privateKey: '5fbfba72d025d3ab62849a654b5d90f7839af854f7566fc0317251e6becc17ac',
		smartAccount: '0xE17Fa0F009d2A3EaC3C2994D7933eD759CbCe257',
	},
	{
		alias: 'Municipality',
		address: '0x7131EDcF4500521cB6B55C0658b2d83589946f44',
		privateKey: '51812b53380becea3bd28994d28151adb36b7ce04fb777826497d9fc5e88574b',
		smartAccount: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B',
		isFieldOffice: true,
	},
	{
		alias: 'Beneficiary',
		address: '0xCc85BeEE78Cc66C03Dc6aa70080d66c85DCB308D',
		privateKey: '7d3eec01a82e7880cb3506377a94f3fd9f232793a094a6a361a8788b6603c6d4',
		smartAccount: '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4',
	},
];

const ENTRY_POINT_VALUE = '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b';
const SAFE_API_KEY_VALUE =
	'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzYWZlLWF1dGgtc2VydmljZSIsInN1YiI6IjEwZDdhZDEyZTNmMzQ3YjZiNWFhZGU5NzhkNzI4YmZjXzlmMTY5OTU2ZGYzZjQxNWM5NDE1MWNlZmVkMTU5MzEwIiwia2V5IjoiMTBkN2FkMTJlM2YzNDdiNmI1YWFkZTk3OGQ3MjhiZmNfOWYxNjk5NTZkZjNmNDE1Yzk0MTUxY2VmZWQxNTkzMTAiLCJhdWQiOlsic2FmZS1hdXRoLXNlcnZpY2UiXSwiZXhwIjoxOTI2MDQ4ODAwLCJyb2xlcyI6W10sImRhdGEiOnt9fQ.7smvjVjkT50TUSRtiYCgudEWcz1MJrSGbr0YNOTOe7Rc70EXBNUECjkFT4OS2b2lP2myXJ2ZDnUcp_yyQIrelA';
const SAFE_PROPOSER_PRIVATE_ADDRESS_VALUE =
	'0x8a104251f94eba07cb8c2a4407ca3e975c037a35a6fddc81ac4bcfd49ce6bb32';
const SAFE_WALLET_ADDRESS_VALUE = '0x8241F385c739F7091632EEE5e72Dbb62f2717E76';

function buildSettingEntry({ name, value, dataType = 'OBJECT', isPrivate = false }) {
	return {
		name,
		value,
		dataType,
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate,
	};
}

function buildFundManagementTabs(selectedOptionalTabs) {
	const hasCashTracker = selectedOptionalTabs.includes('cashTracker');
	const hasMultisigWallet = selectedOptionalTabs.includes('multisigWallet');
	const tabs = [];

	if (hasCashTracker) {
		tabs.push({ label: 'Cash Tracker', value: 'cashTracker' });
	}

	tabs.push(...MANDATORY_TABS);

	if (hasMultisigWallet) {
		tabs.push({ label: 'Multi-Sig (Gnosis)', value: 'multisigWallet' });
	}

	return tabs;
}

function buildSettingsToUpsert(selectedOptionalTabs) {
	const settings = [];
	const tabs = buildFundManagementTabs(selectedOptionalTabs);

	settings.push(
		buildSettingEntry({
			name: FUNDMANAGEMENT_TAB_CONFIG_NAME,
			value: JSON.stringify({ tabs }),
			dataType: 'OBJECT',
			isPrivate: false,
		})
	);

	if (selectedOptionalTabs.includes('cashTracker')) {
		settings.push(
			buildSettingEntry({
				name: 'ENTITIES',
				value: JSON.stringify(CASH_TRACKER_ENTITIES),
				dataType: 'OBJECT',
				isPrivate: false,
			})
		);

		settings.push(
			buildSettingEntry({
				name: 'ENTRY_POINT',
				value: JSON.stringify(ENTRY_POINT_VALUE),
				dataType: 'STRING',
				isPrivate: false,
			})
		);
	}

	if (selectedOptionalTabs.includes('multisigWallet')) {
		settings.push(
			buildSettingEntry({
				name: 'SAFE_API_KEY',
				value: JSON.stringify(SAFE_API_KEY_VALUE),
				dataType: 'OBJECT',
				isPrivate: true,
			}),
			buildSettingEntry({
				name: 'SAFE_PROPOSER_PRIVATE_ADDRESS',
				value: JSON.stringify(SAFE_PROPOSER_PRIVATE_ADDRESS_VALUE),
				dataType: 'OBJECT',
				isPrivate: false,
			}),
			buildSettingEntry({
				name: 'SAFE_WALLET',
				value: JSON.stringify({ ADDRESS: SAFE_WALLET_ADDRESS_VALUE }),
				dataType: 'OBJECT',
				isPrivate: false,
			})
		);
	}

	return { tabs, settings };
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

async function askOptionalFundManagementTabs() {
	const answers = await prompt([
		{
			type: 'checkbox',
			name: 'selectedOptionalTabs',
			message:
				'Select optional Fund Management tabs (Tokens Overview and Fund Management List are always included):',
			choices: OPTIONAL_TAB_CHOICES.map((tab) => ({
				name: tab.label,
				value: tab.value,
				checked: tab.value === 'cashTracker',
			})),
			validate: (selected) =>
				selected.length > 0
					? true
					: 'Select at least one optional tab: Cash Tracker or Multi-Sig (Gnosis).',
		},
	]);

	return answers.selectedOptionalTabs;
}

async function confirmSelection(selectedFile, tabs, settings) {
	console.log('\nSelected Fund Management tabs:');
	console.log(JSON.stringify({ tabs }, null, 2));

	console.log('\nSettings to upsert:');
	console.log(settings.map((setting) => setting.name).join(', '));

	const answers = await prompt([
		{
			type: 'confirm',
			name: 'confirmed',
			message: `Apply these settings to ${selectedFile}?`,
			default: true,
		},
	]);

	return answers.confirmed;
}

async function updateDeploymentFile(fileName, settingsToUpsert) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];

	for (const settingToUpsert of settingsToUpsert) {
		const existingIndex = settings.findIndex(
			(setting) => setting && setting.name === settingToUpsert.name
		);

		if (existingIndex >= 0) {
			settings[existingIndex] = settingToUpsert;
		} else {
			settings.push(settingToUpsert);
		}
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
	const selectedOptionalTabs = await askOptionalFundManagementTabs();
	const { tabs, settings } = buildSettingsToUpsert(selectedOptionalTabs);
	const confirmed = await confirmSelection(selectedFile, tabs, settings);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	await updateDeploymentFile(selectedFile, settings);

	console.log(`UPDATED: ${selectedFile}`);
	console.log(`UPDATED SETTINGS: ${settings.map((setting) => setting.name).join(', ')}`);
}

main().catch((error) => {
	console.error('Failed to update fund management configuration in deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
