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
  existingGroupInkind: {
    uuid: string;
    groupId: string;
  } | null;
}
