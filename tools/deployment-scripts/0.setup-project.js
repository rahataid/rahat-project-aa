/**
 * 0.setup-project.js
 *
 * Step 0 of the deployment setup workflow.
 *
 * Creates the initial deployment JSON file for a project under the `deployments/`
 * directory. This file acts as the single source of truth for all subsequent setup
 * scripts (chain settings, forecast tabs, wallet keys, contracts, etc.).
 *
 * What it does:
 *   - Prompts for a unique project ID (used as the filename: <projectId>.json)
 *   - Collects core project metadata: ACTIVE_YEAR, RIVER_BASIN, PROJECT_NAME, PROJECT_TYPE
 *   - Writes a new deployment file with the PROJECTINFO setting
 *   - Asks before overwriting if the file already exists
 *
 * Prerequisites:
 *   - None. This is the first script to run.
 *
 * Usage:
 *   node tools/deployment-scripts/0.setup-project.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');

async function ensureDeploymentDirectory() {
	await fs.mkdir(DEPLOYMENT_DIR, { recursive: true });
}

async function askProjectId() {
	const answers = await prompt([
		{
			type: 'input',
			name: 'projectId',
			message: 'Enter the projectId:',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'projectId is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
	]);

	return answers.projectId;
}

async function askProjectInfo() {
	return prompt([
		{
			type: 'input',
			name: 'activeYear',
			message: 'Enter ACTIVE_YEAR:',
			default: '2024',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'ACTIVE_YEAR is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'riverBasin',
			message: 'Enter RIVER_BASIN:',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'RIVER_BASIN is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'input',
			name: 'projectName',
			message: 'Enter PROJECT_NAME:',
			validate: (input) => {
				if (!input || !input.trim()) {
					return 'PROJECT_NAME is required.';
				}

				return true;
			},
			filter: (input) => input.trim(),
		},
		{
			type: 'list',
			name: 'projectType',
			message: 'Select PROJECT_TYPE:',
			choices: ['FLOOD', 'HEAT_WAVE'],
			default: 'HEAT_WAVE',
		},
	]);
}

async function confirmOverwrite(filePath) {
	try {
		await fs.access(filePath);

		const answers = await prompt([
			{
				type: 'confirm',
				name: 'shouldOverwrite',
				message: `${path.basename(filePath)} already exists. Overwrite it?`,
				default: false,
			},
		]);

		return answers.shouldOverwrite;
	} catch {
		return true;
	}
}

function buildProjectInfoSetting(projectInfo) {
	const value = {
		ACTIVE_YEAR: projectInfo.activeYear,
		RIVER_BASIN: projectInfo.riverBasin,
		PROJECT_NAME: projectInfo.projectName,
		PROJECT_TYPE: projectInfo.projectType,
	};

	return {
		name: 'PROJECTINFO',
		value: JSON.stringify(value),
		dataType: 'OBJECT',
		requiredFields: '{}',
		isReadOnly: false,
		isPrivate: false,
	};
}

async function writeDeploymentFile(projectId, setting) {
	const filePath = path.join(DEPLOYMENT_DIR, `${projectId}.json`);
	const shouldWrite = await confirmOverwrite(filePath);

	if (!shouldWrite) {
		console.log(`Skipped writing ${filePath}.`);
		return;
	}

	const payload = {
		projectId,
		settings: [setting],
	};

	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	console.log(`Deployment file created at ${filePath}`);
}

async function main() {
	await ensureDeploymentDirectory();

	const projectId = await askProjectId();
	const projectInfo = await askProjectInfo();
	const projectInfoSetting = buildProjectInfoSetting(projectInfo);

	await writeDeploymentFile(projectId, projectInfoSetting);
}

main().catch((error) => {
	console.error('Failed to set up deployment file.');
	console.error(error);
	process.exit(1);
});
