/**
 * 4.setup-aa-contracts.js
 *
 * Step 4 of the deployment setup workflow.
 *
 * Deploys all Anticipatory Action (AA) smart contracts to the configured blockchain
 * network and saves the resulting contract addresses and ABIs into the deployment file.
 *
 * What it does:
 *   - Reads the wallet private key from `Keys` in the deployment file
 *   - Reads the RPC URL from the CHAIN_SETTINGS in the deployment file
 *   - Prompts for the addresses of two pre-deployed core contracts:
 *       - RahatAccessManager
 *       - ERC2771Forwarder
 *   - Deploys 7 AA contracts in order:
 *       TriggerManager → RahatDonor → RahatToken → InkindToken →
 *       AAProject → Inkind → CashToken
 *   - Runs post-deployment permission setup:
 *       - Grants admin role to RahatDonor
 *       - Registers AAProject in RahatDonor
 *       - Grants admin role to the deployer
 *       - Adds Inkind as owner of InkindToken
 *   - Upserts both the CONTRACT and CONTRACTS settings in the deployment file
 *
 * Prerequisites:
 *   - Run 0.setup-project.js, 1.setup-chain-settings.js, and 3.setup-keys.js first
 *   - The deployer wallet must have enough native tokens to cover gas fees
 *   - RahatAccessManager and ERC2771Forwarder must already be deployed
 *   - Contract ABI/bytecode JSON files must exist in tools/deployment-scripts/contracts/
 *
 * Usage:
 *   node tools/deployment-scripts/4.setup-aa-contracts.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const {
	Wallet,
	JsonRpcProvider,
	ContractFactory,
	Contract,
	isAddress,
} = require('ethers');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const CONTRACTS_DIR = path.resolve(__dirname, 'contracts');
const CHAIN_SETTINGS_NAME = 'CHAIN_SETTINGS';
const CONTRACT_SETTING_NAME = 'CONTRACT';
const CONTRACTS_SETTING_NAME = 'CONTRACTS';

function buildContractsSettingEntry(name, contractsValue) {
	return {
		name,
		value: JSON.stringify(contractsValue),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
	};
}

async function readJsonFile(filePath) {
	const content = await fs.readFile(filePath, 'utf8');
	return JSON.parse(content);
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

function getWalletFromKeys(payload) {
	const keys = payload?.Keys;

	if (!keys || typeof keys !== 'object') {
		throw new Error(
			'Keys not found in deployment file. Please run 3.setup-keys.js first.'
		);
	}

	// Prefer private key over mnemonic for explicit control over the derived account index
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

async function askCoreContracts(defaults = {}) {
	const answers = await prompt([
		{
			type: 'input',
			name: 'rahatAccessManager',
			message: 'Enter RahatAccessManager contract address:',
			default: defaults.rahatAccessManager || '',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'erc2771Forwarder',
			message: 'Enter ERC2771Forwarder contract address:',
			default: defaults.erc2771Forwarder || '',
			validate: (input) =>
				isAddress((input || '').trim())
					? true
					: 'Please enter a valid EVM address.',
			filter: (input) => input.trim(),
		},
	]);

	return {
		rahatAccessManager: answers.rahatAccessManager,
		erc2771Forwarder: answers.erc2771Forwarder,
	};
}

function getCoreDefaultsFromContractsSetting(contractsSettingValue) {
	if (!contractsSettingValue || typeof contractsSettingValue !== 'object') {
		return {};
	}

	const access =
		contractsSettingValue.RAHATACCESSMANAGER?.address ??
		contractsSettingValue.RAHATACCESSMANAGER?.ADDRESS;
	const forwarder =
		contractsSettingValue.ERC2771FORWARDER?.address ??
		contractsSettingValue.ERC2771FORWARDER?.ADDRESS;

	return {
		rahatAccessManager: typeof access === 'string' ? access : '',
		erc2771Forwarder: typeof forwarder === 'string' ? forwarder : '',
	};
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

async function readArtifact(contractName) {
	const filePath = path.join(CONTRACTS_DIR, `${contractName}.json`);
	return readJsonFile(filePath);
}

async function deployContract({ contractName, args, signer, provider }) {
	const artifact = await readArtifact(contractName);
	const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
	const contract = await factory.deploy(...args);
	await contract.waitForDeployment();
	const tx = contract.deploymentTransaction();
	const receipt = tx ? await tx.wait() : null;
	const address = await contract.getAddress();

	return {
		contract,
		address,
		abi: artifact.abi,
		startBlock: receipt?.blockNumber ?? 1,
		provider,
	};
}

function summarizeDeploymentPlan(selectedFile, rpcUrl, coreContracts, deployerAddress) {
	console.log('\nDeployment summary:');
	console.log(`- file: ${selectedFile}`);
	console.log(`- rpcUrl: ${rpcUrl}`);
	console.log(`- deployer: ${deployerAddress}`);
	console.log(`- RahatAccessManager: ${coreContracts.rahatAccessManager}`);
	console.log(`- ERC2771Forwarder: ${coreContracts.erc2771Forwarder}`);
	console.log(
		'- contracts: TriggerManager, RahatDonor, RahatToken, InkindToken, AAProject, Inkind, CashToken'
	);
}

async function askFinalConfirmation() {
	const answers = await prompt([
		{
			type: 'confirm',
			name: 'confirmed',
			message: 'Proceed with deployment and update the selected file?',
			default: true,
		},
	]);

	return answers.confirmed;
}

async function configurePermissions(coreContracts, deployed, signer) {
	const accessArtifact = await readArtifact('RahatAccessManager');
	const accessContract = new Contract(
		coreContracts.rahatAccessManager,
		accessArtifact.abi,
		signer
	);

	const donorAddress = deployed.RAHATDONOR.ADDRESS;
	const aaProjectAddress = deployed.AAPROJECT.ADDRESS;
	const inkindAddress = deployed.INKIND.ADDRESS;
	const inkindTokenAddress = deployed.INKINDTOKEN.ADDRESS;

	// Grant admin role (role id = 0) to RahatDonor so it can manage project funds
	const grantDonorTx = await accessContract.grantRole(0, donorAddress, 0);
	await grantDonorTx.wait();

	// Register the AA project in the donor contract so it can receive fund disbursements
	const donorArtifact = await readArtifact('RahatDonor');
	const donorContract = new Contract(donorAddress, donorArtifact.abi, signer);
	const registerTx = await donorContract.registerProject(aaProjectAddress, true);
	await registerTx.wait();

	// Grant admin role to the deployer so post-deploy configuration calls succeed
	const grantDeployerTx = await accessContract.grantRole(0, signer.address, 0);
	await grantDeployerTx.wait();

	// Allow the Inkind contract to mint/burn InkindToken on behalf of beneficiaries
	const inkindTokenArtifact = await readArtifact('InkindToken');
	const inkindTokenContract = new Contract(
		inkindTokenAddress,
		inkindTokenArtifact.abi,
		signer
	);
	const addOwnerTx = await inkindTokenContract.addOwner(inkindAddress);
	await addOwnerTx.wait();
}

function buildContractsValueMap(deployedContracts) {
	return {
		TRIGGERMANAGER: {
			abi: deployedContracts.TRIGGERMANAGER.abi,
			address: deployedContracts.TRIGGERMANAGER.address,
		},
		RAHATDONOR: {
			abi: deployedContracts.RAHATDONOR.abi,
			address: deployedContracts.RAHATDONOR.address,
		},
		RAHATTOKEN: {
			abi: deployedContracts.RAHATTOKEN.abi,
			address: deployedContracts.RAHATTOKEN.address,
		},
		INKINDTOKEN: {
			abi: deployedContracts.INKINDTOKEN.abi,
			address: deployedContracts.INKINDTOKEN.address,
		},
		AAPROJECT: {
			abi: deployedContracts.AAPROJECT.abi,
			address: deployedContracts.AAPROJECT.address,
		},
		INKIND: {
			abi: deployedContracts.INKIND.abi,
			address: deployedContracts.INKIND.address,
		},
		CASHTOKEN: {
			abi: deployedContracts.CASHTOKEN.abi,
			address: deployedContracts.CASHTOKEN.address,
		},
	};
}

async function writeUpdatedDeploymentFile(fileName, payload, contractsValue) {
	const settings = Array.isArray(payload.settings) ? payload.settings : [];
	const contractEntry = buildContractsSettingEntry(CONTRACT_SETTING_NAME, contractsValue);
	const contractsEntry = buildContractsSettingEntry(
		CONTRACTS_SETTING_NAME,
		contractsValue
	);
	const contractIndex = settings.findIndex(
		(setting) => setting && setting.name === CONTRACT_SETTING_NAME
	);
	const contractsIndex = settings.findIndex(
		(setting) => setting && setting.name === CONTRACTS_SETTING_NAME
	);

	if (contractIndex >= 0) {
		settings[contractIndex] = contractEntry;
	} else {
		settings.push(contractEntry);
	}

	if (contractsIndex >= 0) {
		settings[contractsIndex] = contractsEntry;
	} else {
		settings.push(contractsEntry);
	}

	payload.settings = settings;

	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

	return contractIndex >= 0 || contractsIndex >= 0 ? 'updated' : 'added';
}

async function main() {
	const deploymentFiles = await getDeploymentFiles();

	if (!deploymentFiles.length) {
		throw new Error(`No deployment files found in ${DEPLOYMENT_DIR}`);
	}

	const selectedFile = await askTargetFile(deploymentFiles);
	const filePath = path.join(DEPLOYMENT_DIR, selectedFile);
	const payload = await readJsonFile(filePath);
	const wallet = getWalletFromKeys(payload);
	const rpcUrl = getRpcUrlFromChainSettings(payload);

	const existingContractsSetting = parseSettingValue(
		getSetting(payload.settings, CONTRACTS_SETTING_NAME)
	);
	const coreDefaults = getCoreDefaultsFromContractsSetting(existingContractsSetting);
	const coreContracts = await askCoreContracts(coreDefaults);

	summarizeDeploymentPlan(selectedFile, rpcUrl, coreContracts, wallet.address);
	const confirmed = await askFinalConfirmation();

	if (!confirmed) {
		console.log('Deployment cancelled. No file was modified.');
		return;
	}

	const provider = new JsonRpcProvider(rpcUrl);
	const signer = new Wallet(wallet.privateKey, provider);

	console.log('\nDeploying TriggerManager...');
	const triggerManager = await deployContract({
		contractName: 'TriggerManager',
		args: [2],
		signer,
		provider,
	});

	console.log('Deploying RahatDonor...');
	const rahatDonor = await deployContract({
		contractName: 'RahatDonor',
		args: [signer.address, coreContracts.rahatAccessManager],
		signer,
		provider,
	});

	console.log('Deploying RahatToken...');
	const rahatToken = await deployContract({
		contractName: 'RahatToken',
		args: [
			coreContracts.erc2771Forwarder,
			'RahatToken',
			'RHT',
			rahatDonor.address,
			6,
		],
		signer,
		provider,
	});

	console.log('Deploying InkindToken...');
	const inkindToken = await deployContract({
		contractName: 'RahatToken',
		args: [
			coreContracts.erc2771Forwarder,
			'InkindToken',
			'INKIND',
			signer.address,
			1,
		],
		signer,
		provider,
	});

	console.log('Deploying AAProject...');
	const aaProject = await deployContract({
		contractName: 'AAProject',
		args: [
			'AAProject',
			rahatToken.address,
			coreContracts.erc2771Forwarder,
			coreContracts.rahatAccessManager,
			triggerManager.address,
		],
		signer,
		provider,
	});

	console.log('Deploying Inkind...');
	const inkind = await deployContract({
		contractName: 'Inkind',
		args: [inkindToken.address, coreContracts.rahatAccessManager],
		signer,
		provider,
	});

	console.log('Deploying CashToken...');
	const cashToken = await deployContract({
		contractName: 'CashToken',
		args: ['CashToken', 'CASH', 1, 100000, rahatDonor.address],
		signer,
		provider,
	});

	const deployedContracts = {
		TRIGGERMANAGER: {
			address: triggerManager.address,
			abi: triggerManager.abi,
			startBlock: triggerManager.startBlock,
		},
		RAHATDONOR: {
			address: rahatDonor.address,
			abi: rahatDonor.abi,
			startBlock: rahatDonor.startBlock,
		},
		RAHATTOKEN: {
			address: rahatToken.address,
			abi: rahatToken.abi,
			startBlock: rahatToken.startBlock,
		},
		INKINDTOKEN: {
			address: inkindToken.address,
			abi: (await readArtifact('InkindToken')).abi,
			startBlock: inkindToken.startBlock,
		},
		AAPROJECT: {
			address: aaProject.address,
			abi: aaProject.abi,
			startBlock: aaProject.startBlock,
		},
		INKIND: {
			address: inkind.address,
			abi: inkind.abi,
			startBlock: inkind.startBlock,
		},
		CASHTOKEN: {
			address: cashToken.address,
			abi: cashToken.abi,
			startBlock: cashToken.startBlock,
		},
	};

	console.log('Configuring post-deployment permissions...');
	await configurePermissions(
		coreContracts,
		{
			RAHATDONOR: { ADDRESS: deployedContracts.RAHATDONOR.address },
			AAPROJECT: { ADDRESS: deployedContracts.AAPROJECT.address },
			INKIND: { ADDRESS: deployedContracts.INKIND.address },
			INKINDTOKEN: { ADDRESS: deployedContracts.INKINDTOKEN.address },
		},
		signer
	);

	const contractsValue = buildContractsValueMap(deployedContracts);
	const action = await writeUpdatedDeploymentFile(selectedFile, payload, contractsValue);

	console.log(
		`\n${action.toUpperCase()}: ${CONTRACT_SETTING_NAME} and ${CONTRACTS_SETTING_NAME} in ${selectedFile}`
	);
	console.log('Deployed contract addresses:');
	for (const [key, value] of Object.entries(contractsValue)) {
		console.log(`- ${key}: ${value.address}`);
	}
}

main().catch((error) => {
	console.error('Failed to setup AA contracts and update deployment file.');
	console.error(error.message || error);
	process.exit(1);
});
