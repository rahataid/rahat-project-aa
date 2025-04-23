import { Inject, Injectable } from '@nestjs/common';
import { TransportType, TriggerType } from '@rumsan/connect';
import { PrismaService } from '@rumsan/prisma';
import {
  CreateCommunicationDto,
  TriggerCommunicationDto,
} from '../dtos/communication/create-communication.dto';
import { CommsClient } from './connect.communication';
import { RpcException } from '@nestjs/microservices';
import { BroadCastMessage } from '../constants/types';

@Injectable()
export class CvaCommunicationService {
  constructor(
    @Inject('COMMS_CLIENT')
    private commsClient: CommsClient,
    private prisma: PrismaService
  ) {}

  async createCampaign(dto: CreateCommunicationDto) {
    return this.prisma.communication.create({
      data: dto,
    });
  }

  findOne(uuid: string) {
    return this.prisma.communication.findUnique({
      where: { uuid },
    });
  }

  async listBenefByGroup(groupUID: string) {
    const rows = await this.prisma.beneficiaryGroup.findMany({
      where: {
        groupUID,
      },
      include: {
        beneficiary: true,
      },
    });
    if (!rows.length) throw new Error('No beneficiaries found in the group');
    return rows.map((row) => row.beneficiary);
  }

  pickPhoneOrEmail(beneficiaries: any[], type: string) {
    if (type === TransportType.SMTP) return beneficiaries.map((b) => b.email);
    else return beneficiaries.map((b) => b.phone);
  }

  async triggerCommunication(dto: TriggerCommunicationDto) {
    const comm = await this.findOne(dto.communicationId);
    if (!comm) throw new RpcException('Communication not found');
    const { sessionId, transportId, groupUID, message } = comm;
    if (!groupUID) throw new RpcException('Group not found');
    if (sessionId) throw new RpcException('Communication already triggered');
    const transport = await this.commsClient.transport.get(transportId);
    if (!transport) throw new RpcException('Transport not found');
    const beneficiaries = await this.listBenefByGroup(groupUID);
    const addresses = this.pickPhoneOrEmail(
      beneficiaries,
      transport.data?.type
    );
    if (!addresses.length) throw new RpcException('No valid addresses found!');
    return this.broadcastMessages({
      uuid: dto.communicationId,
      addresses,
      msgContent: message,
      transportId,
    });
  }

  async listMessageStatus(payload: any): Promise<unknown> {
    const commsData = await this.commsClient.broadcast.list(payload);
    return commsData?.response;
  }

  async boradCastCountsStats(): Promise<unknown> {
    // @ts-ignore
    const commsData = await this.commsClient.broadcast.getStatusCount();
    return commsData?.response;
  }

  async broadcastMessages({
    uuid,
    addresses,
    msgContent,
    transportId,
  }: BroadCastMessage) {
    const sessionData = await this.commsClient.broadcast.create({
      addresses: addresses,
      maxAttempts: 3,
      message: {
        content: msgContent,
        meta: {
          subject: 'INFO',
        },
      },
      options: {},
      transport: transportId,
      trigger: TriggerType.IMMEDIATE,
    });
    const session = sessionData.data;

    return this.updateCommSession(uuid, session.cuid);
  }

  async updateCommSession(uuid: string, sessionId: string) {
    return this.prisma.communication.update({
      where: { uuid },
      data: {
        sessionId,
      },
    });
  }

  async getsession(payload: { sessionId: string }) {
    const sessionDetails = (
      await this.commsClient.session.get(payload.sessionId)
    ).data;
    return sessionDetails;
  }

  getTransportDetails(payload: { transportId: string }): any {
    return this.commsClient.transport.get(payload.transportId);
  }
}
