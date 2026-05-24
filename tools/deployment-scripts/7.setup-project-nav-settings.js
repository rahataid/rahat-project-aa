/**
 * 7.setup-project-nav-settings.js
 *
 * Step 7 of the deployment setup workflow.
 *
 * Configures the PROJECT_NAV_CONFIG setting for a project deployment file.
 * This setting controls the navigation menu items visible in the project UI.
 *
 * What it does:
 *   - Prompts to select the target deployment file
 *   - Upserts the PROJECT_NAV_CONFIG entry in the selected deployment file
 *
 * Prerequisites:
 *   - A deployment file must exist (run 0.setup-project.js first)
 *
 * Usage:
 *   node tools/deployment-scripts/7.setup-project-nav-settings.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const DEPLOYMENT_DIR = path.resolve(__dirname, 'deployments');
const SETTING_NAME = 'PROJECT_NAV_CONFIG';

const NAV_SETTINGS = {
  navsettings: [
    {
      icon: 'LayoutDashboard',
      path: '',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Dashboard',
    },
    {
      icon: 'UsersRound',
      path: 'beneficiary',
      title: 'Project Beneficiaries',
    },
    {
      icon: 'CircleUserRound',
      path: 'stakeholders',
      title: 'Stakeholders',
    },
    {
      icon: 'HardDrive',
      path: 'data-sources',
      title: 'Forecast Data',
    },
    {
      icon: 'SquareActivity',
      path: 'activities',
      title: 'Activities',
    },
    {
      icon: 'CloudAlert',
      path: 'trigger-statements',
      title: 'Trigger Statements',
    },
    {
      icon: 'Coins',
      path: 'fund-management',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Fund Management',
    },
    {
      icon: 'HandCoinsIcon',
      path: 'payout',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Payout',
    },
    {
      icon: 'Box',
      path: 'inkind-management',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Inkind Management',
    },
    {
      icon: 'Store',
      path: 'vendors',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Vendors',
    },
    {
      icon: 'PhoneOutgoing',
      path: 'communication-logs',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Communication Logs',
    },
    {
      icon: 'SmartphoneNfc',
      path: 'grievances',
      roles: ['ADMIN', 'MANAGER', 'UNICEFNepalCO', 'Municipality'],
      title: 'Grievances',
    },
  ],
};

function buildProjectNavEntry() {
  return {
    name: SETTING_NAME,
    value: JSON.stringify(NAV_SETTINGS),
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

async function confirmSelection(selectedFile) {
  console.log('\nPROJECT_NAV_CONFIG will be set to:');
  console.log(JSON.stringify(NAV_SETTINGS, null, 2));

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
  const confirmed = await confirmSelection(selectedFile);

  if (!confirmed) {
    console.log('No deployment files were modified.');
    return;
  }

  const entry = buildProjectNavEntry();
  const action = await updateDeploymentFile(selectedFile, entry);
  console.log(`${action.toUpperCase()}: ${SETTING_NAME} in ${selectedFile}`);
}

main().catch((error) => {
  console.error('Failed to update PROJECT_NAV_CONFIG in deployment files.');
  console.error(error.message || error);
  process.exit(1);
});
