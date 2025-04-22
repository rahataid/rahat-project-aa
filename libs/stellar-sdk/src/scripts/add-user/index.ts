import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../logger";

// This is needed for local environment only to add user

const command = 'docker compose -p sdp-multi-tenant exec -T sdp-api ./dev/scripts/add_test_users.sh';
const execPromise = promisify(exec);

export const add_user = async (tenantName: string) => {

    logger.info(`Creating owner account for ${tenantName}...`)
    try {
    await execPromise(command)
    logger.warn('Created owner successfully')
    logger.info('----------------------------')
    logger.info(`Email: owner@${tenantName}.local`)
    logger.info('Password: Password123!')
    logger.info('----------------------------')
    } catch (error) {
        console.error(error)
    }
    
}


