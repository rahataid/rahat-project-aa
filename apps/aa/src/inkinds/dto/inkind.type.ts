import { InkindType } from './inkind.dto';

// ==================== CORE API TYPES ====================

/** Payload for creating a group with beneficiaries via CORE */
export interface CreateGroupPayload {
  name: string;
  projectId?: string;
  groupPurpose: string;
  beneficiaries: { uuid: string }[];
}

/** Response from CORE when creating a group */
export interface CreateGroupResponse {
  count: number;
  group: {
    id: number;
    uuid: string;
    name: string;
    groupPurpose: string;
    createdAt: Date;
  };
}

/** Payload for assigning beneficiaries to a group via CORE */
export interface AssignBeneficiariesPayload {
  groupUuid: string;
  beneficiaries: { uuid: string }[];
}

/** Response from CORE when assigning beneficiaries to a group */
export interface AssignBeneficiariesResponse {
  added: number;
  group: Record<string, any>;
  success: boolean;
}

// ==================== INKIND RECORD TYPES ====================

/** Simplified inkind record used for validation */
export interface InkindRecord {
  uuid: string;
  name: string;
  type: string;
}

/** Existing group inkind reference */
export interface ExistingGroupInkind {
  uuid: string;
  groupId: string;
}

// ==================== INKIND REDEMPTION TYPES ====================

export interface PreDefinedRedemptionItem {
  inkindUuid: string;
  groupInkindUuid: string;
  inkindName: string;
  groupInkind: {
    uuid: string;
    groupId: string;
    quantityAllocated: number;
    memberCount: number;
  };
}

export interface WalkInRedemptionItem {
  inkindUuid: string;
  inkindName: string;
  existingGroupInkind: ExistingGroupInkind | null;
}

// ==================== REDEMPTION RESULT TYPES ====================

/** Base redemption result properties */
interface BaseRedemptionResult {
  inkindUuid: string;
  inkindName: string;
  groupInkindUuid: string;
  quantityRedeemed: number;
  redemptionId: string;
}

/** Result of a PRE_DEFINED inkind redemption */
export interface PreDefinedRedemptionResult extends BaseRedemptionResult {
  type: typeof InkindType.PRE_DEFINED;
}

/** Result of a WALK_IN inkind redemption */
export interface WalkInRedemptionResult extends BaseRedemptionResult {
  type: typeof InkindType.WALK_IN;
  isNewGroup: boolean;
}

/** Combined redemption result type */
export type RedemptionResult =
  | PreDefinedRedemptionResult
  | WalkInRedemptionResult;

/** Response from beneficiary inkind redemption */
export interface BeneficiaryRedemptionResponse {
  success?: boolean;
  message: string;
  redemptions: RedemptionResult[];
}
