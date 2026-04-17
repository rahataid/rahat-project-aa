export class UpdateVendorDetailsDto {
    uuid?: string;
    name?: string;
    email?: string;
    phone?: string;
    extras?: Record<string, any>;
    notes?: string;
}