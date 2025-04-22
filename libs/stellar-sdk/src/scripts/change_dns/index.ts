import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export const change_dns = async (tenantName: string): Promise<void> => {
    try {
        const { stdout, stderr } = await execPromise(`./change_domain.sh ${tenantName}`);
        
        if (stderr) {
            console.error('Error:', stderr);
        } else {
            console.log(stdout);
        }
    } catch (error) {
        console.error('Failed to execute script:', error);
    }
};

