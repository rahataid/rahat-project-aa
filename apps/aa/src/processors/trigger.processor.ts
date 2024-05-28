import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { DhmService } from '../datasource/dhm.service';
import { Job } from 'bull';
import { PhasesService } from '../phases/phases.service';
import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { ConfigService } from '@nestjs/config';
// import { BeneficiaryService } from '../beneficiary/beneficiary.service';
// import { createContractInstanceSign, demoFunction, getContractByName } from '../utils/web3';
import { PrismaService } from '@rumsan/prisma';
import { Contract, JsonRpcProvider, ethers } from 'ethers';

@Processor(BQUEUE.TRIGGER)
export class TriggerProcessor {
  private readonly logger = new Logger(TriggerProcessor.name);
  private communicationService: CommunicationService;

  constructor(
    private readonly phaseService: PhasesService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }

  @Process(JOBS.TRIGGERS.COMMS_TRIGGER)
  async processCommunicationTrigger(job: Job) {
    const campaignId = job.data
    await this.communicationService.communication.triggerCampaign(campaignId)
    return
  }

  @Process(JOBS.TRIGGERS.PAYOUT_ASSIGN_TRIGGER)
  async processPayoutAssignTrigger(job: Job) {
    try {
      const payload = job.data as {
        benTokens: number;
        wallet: string
      }

      const aaContract = await this.createContractInstanceSign('AAPROJECT')
      console.log(aaContract);
      const aa = aaContract.totalClaimsAssgined()
      console.log("contract response", aa);
      // const txn = await aaContract.assignTokenToBeneficiary(payload.wallet, payload.benTokens);
      // this.logger.log("contract called with txn hash:", txn.hash);
      return "ok"
    } catch (err) {
      console.log(err);
    }
  }


  @Process(JOBS.TRIGGERS.REACHED_THRESHOLD)
  async processTrigger(job: Job) {
    const payload = job.data

    console.log("in reached threshold");
    console.log(payload.dataSource);

    switch (payload.dataSource) {
      case DATA_SOURCES.DHM:
        await this.processDhmData(payload)
        break;
      case DATA_SOURCES.MANUAL:
        await this.processManualTrigger(payload)
        break;

      default:
        break;
    }
  }

  async processDhmData(payload) {
    console.log("porcessing dhm data");
    const phaseData = await this.phaseService.getOne({
      uuid: payload.phaseId
    })

    const conditionsMet = this.checkTriggerConditions(phaseData.triggerRequirements)

    console.log("conditions met", conditionsMet);
    if (conditionsMet) {
      this.phaseService.activatePhase(phaseData.uuid)
    }
    return
  }

  async processManualTrigger(payload) {
    console.log("in manual trigger");
    const phaseData = await this.phaseService.getOne({
      uuid: payload.phaseId
    })

    const conditionsMet = this.checkTriggerConditions(phaseData.triggerRequirements)
    console.log("in manual trigger conditions met", conditionsMet);

    if (conditionsMet) {
      this.phaseService.activatePhase(phaseData.uuid)
    }
    return
  }

  checkTriggerConditions(triggerRequirements) {
    const { mandatoryTriggers, optionalTriggers } = triggerRequirements;

    // if not triggers are set return false
    if (!mandatoryTriggers.requiredTriggers && !optionalTriggers.requiredTriggers) return false

    const mandatoryMet = mandatoryTriggers.receivedTriggers >= mandatoryTriggers.requiredTriggers;
    const optionalMet = optionalTriggers.receivedTriggers >= optionalTriggers.requiredTriggers;

    return mandatoryMet && optionalMet;
  }

  async createContractInstanceSign(contractName: any) {
    //  get RPC URL
    const res = await this.prisma.setting.findFirstOrThrow({
      where: {
        name: 'BLOCKCHAIN',
      },
      select: {
        name: true,
        value: true,
      },
    });
    const blockChainSetting = JSON.parse(JSON.stringify(res))

    //  create wallet from private key
    const provider = new JsonRpcProvider(blockChainSetting?.value?.RPCURL);
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    const wallet = new ethers.Wallet(privateKey, provider);

    const convertToLowerCase = (obj) => {
      const newObj = {};
      for (const key in obj) {
        const newKey = key.toLowerCase();
        const value = obj[key];
        if (Array.isArray(value)) {
          newObj[newKey] = value.map(convertToLowerCase);
        } else if (typeof value === 'object') {
          newObj[newKey] = convertToLowerCase(value);
        } else {
          newObj[newKey] = value;
        }
      }
      return newObj;
    }

    const contract = await this.getContractByName(contractName)
    const abi = contract.ABI.map(convertToLowerCase)
    //  create an instance of the contract
    const contracts = new ethers.Contract(contract.ADDRESS, abi, wallet);
    return contracts
  }

  async getContractByName(contractName: string) {
    const addresses = await this.prisma.setting.findMany({
      where: { name: 'CONTRACT' },
    });
    const address = this.findValueByKey(addresses, contractName);
    if (!address) {
      throw new Error('Contract not found');
    }
    return address;
  }

  findValueByKey(data, keyToFind) {
    // Iterate through the array of objects
    for (const obj of data) {
      // Check if the current object has a value property and if it contains the key we're looking for
      if (obj.value && obj.value.hasOwnProperty(keyToFind)) {
        // Return the value associated with the key
        return obj.value[keyToFind];
      }
    }
    // If the key is not found in any of the objects, return undefined
    return undefined;
  }
}
