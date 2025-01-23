import { createTenant } from "../scripts/tenant/create";

export class TenantServices {
    private tenantName: string;

    constructor(tenantName: string) {
        this.tenantName = tenantName;
    }

    public async createTenant() {
        return createTenant(this.tenantName);
    }
    
}