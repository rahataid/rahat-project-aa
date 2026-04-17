export class UpdateVendorDetailsDto {
    uuid?: string;
    name?: string;
    email?: string
    phone?: string;
    wallet?: string;
    extras?: Record<string, any>;
    notes?: string;
    sessionId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
    createdBy?: string;
    updatedBy?: string;
}