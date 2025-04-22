import { ait } from "../../utils/axiosInstanceTenant";
import { logger } from "../../logger";
import { TENANATS } from "../../routes/tenants";
import { LOGS } from "../../constants/logger";

export const createTenant = async (tenant_name: string) => {

    logger.info(LOGS.INFO.TENANT_CREATING)

    const {OWNER_EMAIL, owner_first_name, owner_last_name, distribution_account_type} = TENANATS;

    const {base_url, sdp_ui_base_url} = TENANATS.URLS(tenant_name)

    try {
    const res = await ait.post(TENANATS.CREATE, {
        name: tenant_name,
        organization_name: tenant_name,
        base_url,
        sdp_ui_base_url,
        owner_email: OWNER_EMAIL(tenant_name),
        owner_first_name,
        owner_last_name,
        distribution_account_type
      })

    logger.warn(LOGS.WARN.TENANT_SUCCESS)

    return res.data;
        
    } catch (error) {
        throw error
    }
}