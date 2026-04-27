/**
 * 2.setup-forecast-tab.js
 *
 * Step 2 of the deployment setup workflow.
 *
 * Configures the FORECAST_TAB_CONFIG setting for a project deployment file.
 * This setting controls which forecast data tabs are visible in the project UI
 * (e.g., DHM, GLOFAS, Daily Monitoring, Gauge Reading, External Links).
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Presents a checkbox list of available forecast tabs
 *   - Upserts the FORECAST_TAB_CONFIG entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/2.setup-forecast-tab.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const SETTING_NAME = 'FORECAST_TAB_CONFIG';

const ALL_TABS = [
  { label: 'DHM', value: 'dhm' },
  { label: 'NWP-DHM', value: 'dhm' },
  { label: 'GLOFAS', value: 'glofas' },
  { label: 'Daily Monitoring', value: 'dailyMonitoring' },
  { label: 'Gauge Reading', value: 'gaugeReading', hasDatePicker: true },
  { label: 'External Links', value: 'externalLinks' },
];

function buildForecastTabEntry(tabs) {
  return {
    name: SETTING_NAME,
    value: JSON.stringify({ tabs }),
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

async function askTabs() {
  const answers = await prompt([
    {
      type: 'checkbox',
      name: 'selectedValues',
      message: 'Select forecast tabs to include (space to select, enter to confirm):',
      choices: ALL_TABS.map((tab) => ({
        name: tab.label,
        value: tab.value,
        checked: false,
      })),
      validate: (selected) =>
        selected.length > 0 ? true : 'You must select at least one tab.',
    },
  ]);

  return ALL_TABS.filter((tab) => answers.selectedValues.includes(tab.value));
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

async function confirmSelection(selectedFile, tabs) {
  console.log('\nSelected FORECAST_TAB_CONFIG tabs:');
  console.log(JSON.stringify({ tabs }, null, 2));

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
  const selectedTabs = await askTabs();
  const confirmed = await confirmSelection(selectedFile, selectedTabs);

  if (!confirmed) {
    console.log('No deployment files were modified.');
    return;
  }

  const entry = buildForecastTabEntry(selectedTabs);
  const action = await updateDeploymentFile(selectedFile, entry);
  console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
  console.error('Failed to update FORECAST_TAB_CONFIG in deployment files.');
  console.error(error.message || error);
  process.exit(1);
});