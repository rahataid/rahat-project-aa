/**
 * 1.setup-chain-settings.js
 *
 * Step 1 of the deployment setup workflow.
 *
 * Configures the blockchain network (CHAIN_SETTINGS) for a project deployment file.
 * Supports both EVM-compatible chains (Base, Polygon) and Stellar networks,
 * with preconfigured presets for testnet and mainnet environments.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Asks whether to configure an EVM or Stellar chain
 *   - Asks whether to use testnet or mainnet
 *   - Presents a list of preconfigured network presets to choose from
 *   - Upserts the CHAIN_SETTINGS entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/1.setup-chain-settings.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const CHAIN_SETTINGS_NAME = 'CHAIN_SETTINGS';

const EVM_PRESETS = {
	testnet: [
		{
			key: 'base-sepolia',
			label: 'Base Sepolia',
			setting: {
				name: 'EVM',
				type: 'evm',
				rpcUrl:
					'https://base-sepolia.g.alchemy.com/v2/bnfGi0PVbNMijQJFjFng2De86z-QvOMR',
				chainId: '84532',
				currency: {
					name: 'eth',
					symbol: 'eth',
				},
				explorerUrl: 'https://sepolia.basescan.org',
			},
		},
		{
			key: 'polygon-amoy',
			label: 'Polygon Test Network',
			setting: {
				name: 'EVM',
				type: 'evm',
				rpcUrl: 'https://rpc-amoy.polygon.technology',
				chainId: '80002',
				currency: {
					name: 'pol',
					symbol: 'pol',
				},
				explorerUrl: 'https://amoy.polygonscan.com',
			},
		},
	],
	mainnet: [
		{
			key: 'base-mainnet',
			label: 'Base Main Network',
			setting: {
				name: 'EVM',
				type: 'evm',
				rpcUrl: 'https://mainnet.base.org',
				chainId: '8453',
				currency: {
					name: 'eth',
					symbol: 'eth',
				},
				explorerUrl: 'https://basescan.org',
			},
		},
		{
			key: 'polygon-mainnet',
			label: 'Polygon Main Network',
			setting: {
				name: 'EVM',
				type: 'evm',
				rpcUrl: 'https://polygon-rpc.com',
				chainId: '137',
				currency: {
					name: 'pol',
					symbol: 'pol',
				},
				explorerUrl: 'https://polygonscan.com',
			},
		},
	],
};

const STELLAR_PRESETS = {
	testnet: [
		{
			key: 'stellar-testnet',
			label: 'Stellar Test Network',
			setting: {
				name: 'testnet',
				type: 'stellar',
				rpcUrl: 'https://soroban-testnet.stellar.org',
				chainId: 'Test SDF Network ; September 2015',
				currency: {
					name: 'stellar',
					symbol: 'XLM',
				},
				explorerUrl: 'https://stellar.expert/explorer/testnet',
			},
		},
	],
	mainnet: [
		{
			key: 'stellar-mainnet',
			label: 'Stellar Main Network',
			setting: {
				name: 'mainnet',
				type: 'stellar',
				rpcUrl: 'https://mainnet.sorobanrpc.com',
				chainId: 'Public Global Stellar Network ; September 2015',
				currency: {
					name: 'stellar',
					symbol: 'XLM',
				},
				explorerUrl: 'https://stellar.expert/explorer/public',
			},
		},
	],
};

function buildChainSettingsEntry(setting) {
	return {
		name: CHAIN_SETTINGS_NAME,
		value: JSON.stringify(setting),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
	};
}

function getPresetGroups(chainType) {
	return chainType === 'evm' ? EVM_PRESETS : STELLAR_PRESETS;
}

function formatPresetChoice(preset) {
	return {
		name: `${preset.label}: ${JSON.stringify(preset.setting)}`,
		value: preset.key,
		short: preset.label,
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

async function askChainType() {
	const answers = await prompt([
		{
			type: 'list',
			name: 'chainType',
			message: 'Which chain settings do you want to add?',
			choices: [
				{ name: 'EVM', value: 'evm' },
				{ name: 'Stellar', value: 'stellar' },
			],
			default: 'evm',
		},
	]);

	return answers.chainType;
}

async function askNetworkTier(chainType) {
	const answers = await prompt([
		{
			type: 'list',
			name: 'networkTier',
			message:
				chainType === 'evm'
					? 'Select EVM network type:'
					: 'Select Stellar network type:',
			choices: [
				{ name: 'Test Network', value: 'testnet' },
				{ name: 'Main Network', value: 'mainnet' },
			],
			default: 'testnet',
		},
	]);

	return answers.networkTier;
}

async function askPreset(chainType, networkTier) {
	const presetGroups = getPresetGroups(chainType);
	const presets = presetGroups[networkTier];

	const answers = await prompt([
		{
			type: 'list',
			name: 'presetKey',
			message: 'Select the prefilled chain settings:',
			choices: presets.map(formatPresetChoice),
		},
	]);

	return presets.find((preset) => preset.key === answers.presetKey);
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

async function confirmSelection(selectedFile, preset) {
	console.log('Selected CHAIN_SETTINGS value:');
	console.log(JSON.stringify(preset.setting, null, 2));

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

async function updateDeploymentFile(fileName, chainSettingsEntry) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];
	const existingIndex = settings.findIndex(
		(setting) => setting && setting.name === CHAIN_SETTINGS_NAME
	);

	if (existingIndex >= 0) {
		settings[existingIndex] = chainSettingsEntry;
	} else {
		settings.push(chainSettingsEntry);
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
	const chainType = await askChainType();
	const networkTier = await askNetworkTier(chainType);
	const preset = await askPreset(chainType, networkTier);
	const confirmed = await confirmSelection(selectedFile, preset);

	if (!confirmed) {
		console.log('No deployment files were modified.');
		return;
	}

	const chainSettingsEntry = buildChainSettingsEntry(preset.setting);
	const action = await updateDeploymentFile(selectedFile, chainSettingsEntry);
	console.log(`${action.toUpperCase()}: ${selectedFile}`);
}

main().catch((error) => {
	console.error('Failed to update CHAIN_SETTINGS in deployment files.');
	console.error(error.message || error);
	process.exit(1);
});
