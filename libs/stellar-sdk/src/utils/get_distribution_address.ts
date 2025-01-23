import { STELLAR } from "../routes/stellar";
import { ait } from "./axiosInstanceTenant";
import { logger } from "../logger";
import { LOGS } from "../constants/logger";

interface Tenant {
    name: string;
    distribution_account_address: string;
}

export const get_distribution_address = async (name: string): Promise<string> => {
    try {
        logger.info(LOGS.INFO.DISBURSEMENT_ADDRESS(name));
        const res = await ait.get(STELLAR.TENANATS);

        const tenants: Tenant[] = res.data;
        const tenant = tenants.find((t) => t.name === name);

        if (!tenant) {
            logger.warn(LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name));
            return LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name);
        }

        return tenant.distribution_account_address;

    } catch (error: any) {
        logger.error(LOGS.ERROR.DISBURSEMENT_ADDRESS(error));
        throw new Error(LOGS.ERROR.DISBURSEMENT_ADDRESS(error));
    }
};
