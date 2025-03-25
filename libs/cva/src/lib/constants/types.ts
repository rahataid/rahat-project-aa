export interface BroadCastMessage {
  uuid: string;
  addresses: string[];
  msgContent: string;
  transportId: string;
}
