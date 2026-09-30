/**
 * deploy-aa-project.js
 *
 * Miscellaneous standalone deployment for AAProject.sol only.
 *
 * Unlike 4.setup-aa-contracts.js, this script does NOT read any contract
 * addresses from the deployment file. It prompts for every constructor
 * argument:
 *   - project name (string)
 *   - defaultToken (RahatToken address)
 *   - forwarder (ERC2771Forwarder address)
 *   - accessManager (RahatAccessManager address)
 *   - triggerManager (TriggerManager address)
 *
 * RPC URL and wallet keys ARE read from the selected deployment file
 * (CHAIN_SETTINGS.rpcUrl + Keys.privateKey/mnemonic).
 *
 * Output:
 *   tools/deployment-scripts/misc/contract-deployment/AAProject/deployed-contract.json
 *   containing { contractName, address, abi, startBlock, chainId, deployedAt }
 *
 * Usage:
 *   node tools/deployment-scripts/misc/deploy-aa-project.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const { Wallet, JsonRpcProvider, ContractFactory, isAddress } = require('ethers');
const {
	selectDeploymentFile,
	DEPLOYMENT_DIR,
} = require('../lib/select-deployment-file');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
const CONTRACTS_DIR = path.resolve(__dirname, '..', 'contracts');
const CHAIN_SETTINGS_NAME = 'CHAIN_SETTINGS';
const CONTRACT_NAME = 'AAProject';
const OUTPUT_DIR = path.resolve(__dirname, 'contract-deployment', CONTRACT_NAME);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'deployed-contract.json');

async function readJsonFile(filePath) {
	const content = await fs.readFile(filePath, 'utf8');
	return JSON.parse(content);
}

function getSetting(settings, name) {
	return (Array.isArray(settings) ? settings : []).find(
		(item) => item && item.name === name
	);
}

function parseSettingValue(settingEntry) {
	if (!settingEntry) {
		return null;
	}

	if (typeof settingEntry.value === 'string') {
		try {
			return JSON.parse(settingEntry.value);
		} catch {
			return null;
		}
	}

	if (settingEntry.value && typeof settingEntry.value === 'object') {
		return settingEntry.value;
	}

	return null;
}

function getRpcUrlFromChainSettings(payload) {
	const settingEntry = getSetting(payload.settings, CHAIN_SETTINGS_NAME);
	const chainSettings = parseSettingValue(settingEntry);
	const rpcUrl = chainSettings?.rpcUrl;

	if (!rpcUrl || typeof rpcUrl !== 'string') {
		throw new Error(
			'CHAIN_SETTINGS.rpcUrl is missing. Please run 1.setup-chain-settings.js first.'
		);
	}

	return rpcUrl;
}

function getWalletFromKeys(payload) {
	const keys = payload?.Keys;

	if (!keys || typeof keys !== 'object') {
		throw new Error(
			'Keys not found in deployment file. Please run 3.setup-keys.js first.'
		);
	}

	if (typeof keys.privateKey === 'string' && keys.privateKey.trim()) {
		return new Wallet(keys.privateKey.trim());
	}

	if (typeof keys.mnemonic === 'string' && keys.mnemonic.trim()) {
		return Wallet.fromPhrase(keys.mnemonic.trim());
	}

	throw new Error(
		'Keys.privateKey or Keys.mnemonic is missing. Please run 3.setup-keys.js first.'
	);
}

async function readArtifact(contractName) {
	const filePath = path.join(CONTRACTS_DIR, `${contractName}.json`);
	return readJsonFile(filePath);
}

async function askConstructorArgs() {
	const answers = await prompt([
		{
			type: 'input',
			name: 'name',
			message: 'Enter project name:',
			validate: (input) =>
				(input || '').trim() ? true : 'Project name cannot be empty.',
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'defaultToken',
			message: 'Enter defaultToken (RahatToken) address:',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'forwarder',
			message: 'Enter forwarder (ERC2771Forwarder) address:',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'accessManager',
			message: 'Enter accessManager (RahatAccessManager) address:',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'triggerManager',
			message: 'Enter triggerManager (TriggerManager) address:',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
	]);

	return [
		answers.name,
		answers.defaultToken,
		answers.forwarder,
		answers.accessManager,
		answers.triggerManager,
	];
}

async function main() {
	const selectedFile = await selectDeploymentFile();
	const payload = await readJsonFile(path.join(DEPLOYMENT_DIR, selectedFile));

	const rpcUrl = getRpcUrlFromChainSettings(payload);
	const wallet = getWalletFromKeys(payload);
	const provider = new JsonRpcProvider(rpcUrl);
	const signer = wallet.connect(provider);

	const args = await askConstructorArgs();

	console.log('\nDeployment summary:');
	console.log(`- file: ${selectedFile}`);
	console.log(`- rpcUrl: ${rpcUrl}`);
	console.log(`- deployer: ${signer.address}`);
	console.log(`- contract: ${CONTRACT_NAME}`);
	console.log(`- args: ${JSON.stringify(args)}`);

	const { confirm } = await prompt([
		{
			type: 'confirm',
			name: 'confirm',
			message: 'Proceed with deployment?',
			default: false,
		},
	]);

	if (!confirm) {
		console.log('Deployment cancelled.');
		return;
	}

	const artifact = await readArtifact(CONTRACT_NAME);
	const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
	const contract = await factory.deploy(...args);
	await contract.waitForDeployment();
	const tx = contract.deploymentTransaction();
	const receipt = tx ? await tx.wait() : null;
	const address = await contract.getAddress();

	const network = await provider.getNetwork();

	const result = {
		contractName: CONTRACT_NAME,
		address,
		abi: artifact.abi,
		startBlock: receipt?.blockNumber ?? 1,
		chainId: Number(network.chainId),
		deployedAt: new Date().toISOString(),
	};

	await fs.mkdir(OUTPUT_DIR, { recursive: true });
	await fs.writeFile(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n');

	console.log(`\n${CONTRACT_NAME} deployed at: ${address}`);
	console.log(`ABI + address saved to: ${OUTPUT_FILE}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});