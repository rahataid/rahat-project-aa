/**
 * update-settings-via-prisma.js
 *
 * Final step of the deployment setup workflow.
 *
 * Reads all settings from a selected deployment JSON file and syncs them to the
 * application database using Prisma. Each setting is upserted (created if missing,
 * updated if it already exists) into the `tbl_settings` table.
 *
 * What it does:
 *   - Prompts to select a deployment file from the `deployments/` directory
 *   - Reads all entries from the `settings` array in that file
 *   - For each setting, normalizes the value type and required fields,
 *     then upserts it via Prisma into the database
 *   - Reports each upserted setting name and a final count
 *
 * Prerequisites:
 *   - A deployment file with settings populated (run scripts 0–6 first)
 *   - A running database with Prisma configured and migrations applied
 *   - DATABASE_URL environment variable set in .env
 *
 * Usage:
 *   node tools/deployment-scripts/update-settings-via-prisma.js
 *   (or via pnpm: pnpm dlx ts-node prisma/seed.ts)
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const { PrismaClient } = require('@prisma/client');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;
const prisma = new PrismaClient();

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');

function normalizeRequiredFields(requiredFields) {
	if (Array.isArray(requiredFields)) {
		return requiredFields.map((field) => String(field));
	}

	if (typeof requiredFields !== 'string') {
		return [];
	}

	const trimmed = requiredFields.trim();

	if (!trimmed || trimmed === '{}' || trimmed === '[]') {
		return [];
	}

	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) ? parsed.map((field) => String(field)) : [];
	} catch {
		return [];
	}
}

// Deserializes a setting's value from its JSON-string form (as stored in deployment files)
// to the native type expected by the Prisma schema (object, number, boolean, or string).
function parseValueForPrisma(setting) {
	const { value, dataType } = setting;

	if (typeof value !== 'string') {
		return value;
	}

	if (dataType === 'OBJECT') {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}

	if (dataType === 'NUMBER') {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? value : parsed;
	}

	if (dataType === 'BOOLEAN') {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	}

	return value;
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
			message: 'Select one deployment file:',
			choices: deploymentFiles.map((fileName) => ({
				name: fileName,
				value: fileName,
			})),
		},
	]);

	return answers.selectedFile;
}

async function getSettingsFromFile(fileName) {
	const filePath = path.join(DEPLOYMENT_DIR, fileName);
	const content = await fs.readFile(filePath, 'utf8');
	const payload = JSON.parse(content);
	const settings = Array.isArray(payload.settings) ? payload.settings : [];

	return settings.filter((setting) => setting && setting.name);
}

async function upsertSetting(setting) {
	const settingForDb = {
		name: setting.name,
		value: parseValueForPrisma(setting),
		dataType: setting.dataType,
		requiredFields: normalizeRequiredFields(setting.requiredFields),
		isReadOnly: Boolean(setting.isReadOnly),
		isPrivate: Boolean(setting.isPrivate),
	};

	return prisma.setting.upsert({
		where: { name: settingForDb.name },
		update: {
			value: settingForDb.value,
			dataType: settingForDb.dataType,
			requiredFields: settingForDb.requiredFields,
			isReadOnly: settingForDb.isReadOnly,
			isPrivate: settingForDb.isPrivate,
		},
		create: settingForDb,
	});
}

async function main() {
	const deploymentFiles = await getDeploymentFiles();

	if (!deploymentFiles.length) {
		throw new Error(`No deployment files found in ${DEPLOYMENT_DIR}`);
	}

	const selectedFile = await askTargetFile(deploymentFiles);
	const settings = await getSettingsFromFile(selectedFile);

	if (!settings.length) {
		throw new Error(`${selectedFile} does not contain any settings.`);
	}

	let upsertedCount = 0;

	for (const setting of settings) {
		const result = await upsertSetting(setting);
		upsertedCount += 1;
		console.log(`UPSERTED: ${result.name}`);
	}

	console.log(`Completed upserting ${upsertedCount} setting(s) from ${selectedFile}.`);
}

main()
	.catch((error) => {
		console.error('Failed to update tbl_settings from deployment settings.');
		console.error(error.message || error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

