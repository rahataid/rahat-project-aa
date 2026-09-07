const inquirer = require('inquirer');

const prompt = inquirer.prompt ?? inquirer.default?.prompt;

const SKIP_EXIT_CODE = 2;

async function maybeSkipStep(stepLabel) {
	const { action } = await prompt([
		{
			type: 'list',
			name: 'action',
			message: `${stepLabel} — proceed or skip to the next step?`,
			choices: [
				{ name: 'Proceed with this step', value: 'proceed' },
				{ name: 'Skip this step', value: 'skip' },
			],
			default: 'proceed',
		},
	]);

	if (action === 'skip') {
		console.log(`Skipped: ${stepLabel}`);
		process.exit(SKIP_EXIT_CODE);
	}
}

module.exports = { maybeSkipStep, SKIP_EXIT_CODE };
