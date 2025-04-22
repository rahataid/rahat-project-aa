import { exec } from 'child_process';
import { promisify } from 'util';

// This is needed for local environment only to add user
const command =
  'docker compose -p sdp-multi-tenant exec -T sdp-api ./dev/scripts/add_test_users.sh';
const execPromise = promisify(exec);

export const add_user = async () => {
  await execPromise(command);
};
