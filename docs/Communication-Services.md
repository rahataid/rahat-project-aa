# Communication Services

This document provides detailed information about the communication services integrated into the Rahat Anticipatory Action platform, including the @rumsan/connect system, message delivery, and communication workflows.

## Overview

The communication system enables multi-channel messaging to beneficiaries and stakeholders, supporting SMS, email, and voice calls. The system is built around the @rumsan/connect platform and integrates seamlessly with the activity management workflow.

## Architecture

### Core Components

#### 1. @rumsan/connect Platform
- **Purpose**: Centralized communication management
- **Integration**: Microservice communication via Redis
- **Features**: Multi-channel delivery, session tracking, delivery status

#### 2. Communication Module
- **Location**: `apps/aa/src/comms/`
- **Components**: `CommsModule`, `CommsService`
- **Purpose**: Initialize and manage communication client

#### 3. Activities Integration
- **Location**: `apps/aa/src/activities/`
- **Purpose**: Central hub for communication management
- **Features**: Communication triggering, session tracking, address management

## Communication Flow

### 1. Communication Initialization

#### CommsService Setup
```typescript
// apps/aa/src/comms/comms.service.ts
@Injectable()
export class CommsService {
  private commsClient: any;

  async init() {
    // Fetch communication settings from core service
    const settings = await this.coreClient.send({
      cmd: 'SETTINGS.GET',
      data: { name: 'COMMUNICATION_SETTINGS' }
    });

    // Initialize @rumsan/connect client
    this.commsClient = new ConnectClient({
      url: settings.value.URL,
      appId: settings.value.APP_ID,
      accessToken: settings.value.ACCESS_TOKEN
    });
  }

  getClient() {
    return this.commsClient;
  }
}
```

#### Global Registration
```typescript
// apps/aa/src/app/app.module.ts
@Module({
  imports: [
    CommsModule,
    // ... other modules
  ],
  providers: [
    {
      provide: 'COMMS_CLIENT',
      useFactory: async (commsService: CommsService) => {
        await commsService.init();
        return commsService.getClient();
      },
      inject: [CommsService],
    }
  ]
})
export class AppModule {}
```

### 2. Communication Configuration

#### Transport Types
```typescript
enum TransportType {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  VOICE = 'VOICE'
}

interface TransportConfig {
  id: string;
  type: TransportType;
  validationAddress: ValidationAddress;
  data?: {
    provider?: string;
    template?: string;
    sender?: string;
  };
}
```

#### Validation Address Types
```typescript
enum ValidationAddress {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL'
}
```

### 3. Activity Communication Integration

#### Communication Data Structure
```typescript
interface ActivityCommunication {
  groupId: string;
  message: string | {
    mediaURL: string;
    fileName: string;
  };
  groupType: 'STAKEHOLDERS' | 'BENEFICIARY';
  transportId: string;
  communicationId: string;
  sessionId?: string;
}
```

#### Communication Triggering
```typescript
// apps/aa/src/activities/activities.service.ts
async triggerCommunication(payload: {
  communicationId: string;
  activityId: string;
}) {
  const activity = await this.prisma.activities.findUnique({
    where: { uuid: payload.activityId }
  });

  const parsedCommunications = JSON.parse(
    JSON.stringify(activity.activityCommunication)
  ) as ActivityCommunication[];

  const selectedCommunication = parsedCommunications.find(
    (c) => c?.communicationId === payload.communicationId
  );

  // Get transport details
  const transportDetails = await this.commsClient.transport.get(
    selectedCommunication.transportId
  );

  // Get recipient addresses
  const addresses = await this.getAddresses(
    selectedCommunication.groupType,
    selectedCommunication.groupId,
    transportDetails.data.validationAddress
  );

  // Prepare message content
  let messageContent: string;
  if (transportDetails.data.type === TransportType.VOICE) {
    const msg = selectedCommunication.message as {
      mediaURL: string;
      fileName: string;
    };
    messageContent = msg.mediaURL;
  } else {
    messageContent = selectedCommunication.message as string;
  }

  // Create broadcast session
  const sessionData = await this.commsClient.broadcast.create({
    uuid: payload.communicationId,
    addresses,
    msgContent: messageContent,
    transportId: selectedCommunication.transportId,
  });

  // Update activity with session ID
  await this.updateActivityCommunicationSession(
    payload.activityId,
    payload.communicationId,
    sessionData.sessionId
  );

  return sessionData;
}
```

### 4. Address Management

#### Beneficiary Address Retrieval
```typescript
async getAddresses(
  groupType: 'STAKEHOLDERS' | 'BENEFICIARY',
  groupId: string,
  validationAddress: ValidationAddress
): Promise<string[]> {
  if (groupType === 'BENEFICIARY') {
    const beneficiaries = await this.getBeneficiariesByGroup(groupId);
    return this.pickPhoneOrEmail(beneficiaries, validationAddress);
  } else {
    const stakeholders = await this.getStakeholdersByGroup(groupId);
    return this.pickPhoneOrEmail(stakeholders, validationAddress);
  }
}

pickPhoneOrEmail(recipients: any[], type: string): string[] {
  if (type === ValidationAddress.EMAIL) {
    return recipients.map((r) => r.email).filter(Boolean);
  } else {
    return recipients.map((r) => r.phone).filter(Boolean);
  }
}
```

### 5. Message Delivery

#### Broadcast Creation
```typescript
// Create broadcast session
const sessionData = await this.commsClient.broadcast.create({
  uuid: communicationId,
  addresses: recipientAddresses,
  msgContent: messageContent,
  transportId: transportId,
  options: {
    priority: 'high',
    retryAttempts: 3,
    deliveryTimeout: 300000 // 5 minutes
  }
});
```

#### Delivery Status Tracking
```typescript
async getSessionLogs(sessionId: string) {
  return this.commsClient.broadcast.getSessionLogs(sessionId);
}

async getDeliveryStatus(broadcastId: string) {
  return this.commsClient.broadcast.getStatus(broadcastId);
}
```

## Communication Channels

### 1. SMS Communication

#### Configuration
```typescript
const smsTransport = {
  id: 'sms-provider-001',
  type: TransportType.SMS,
  validationAddress: ValidationAddress.PHONE,
  data: {
    provider: 'twilio',
    sender: 'RAHAT',
    template: 'Your assistance of {amount} has been activated. Stay safe!'
  }
};
```

#### Message Format
```typescript
const smsMessage = {
  content: "Your assistance of 5000 NPR has been activated due to flood warning. Stay safe!",
  recipients: ["+9779841234567", "+9779841234568"],
  transportId: "sms-provider-001"
};
```

### 2. Email Communication

#### Configuration
```typescript
const emailTransport = {
  id: 'email-provider-001',
  type: TransportType.EMAIL,
  validationAddress: ValidationAddress.EMAIL,
  data: {
    provider: 'sendgrid',
    sender: 'noreply@rahat.org',
    template: 'assistance-activation.html'
  }
};
```

#### Message Format
```typescript
const emailMessage = {
  subject: "Emergency Assistance Activated",
  content: "<html><body><h1>Emergency Assistance</h1><p>Your assistance has been activated...</p></body></html>",
  recipients: ["beneficiary@example.com"],
  transportId: "email-provider-001"
};
```

### 3. Voice Communication

#### Configuration
```typescript
const voiceTransport = {
  id: 'voice-provider-001',
  type: TransportType.VOICE,
  validationAddress: ValidationAddress.PHONE,
  data: {
    provider: 'twilio',
    language: 'ne',
    voice: 'female'
  }
};
```

#### Message Format
```typescript
const voiceMessage = {
  mediaURL: "https://storage.rahat.org/audio/emergency-alert.mp3",
  fileName: "emergency-alert.mp3",
  recipients: ["+9779841234567"],
  transportId: "voice-provider-001"
};
```

## Queue Management

### Communication Queue
```typescript
// apps/aa/src/processors/communication.processor.ts
@Processor(BQUEUE.COMMUNICATION)
export class CommunicationProcessor {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Process(JOBS.ACTIVITIES.COMMUNICATION.TRIGGER)
  async processCommunicationTrigger(job: Job) {
    const payload = job.data;
    await this.activitiesService.triggerCommunication({
      communicationId: payload.communicationId,
      activityId: payload.activityId
    });
    return;
  }
}
```

### Queue Configuration
```typescript
const communicationQueueConfig = {
  name: BQUEUE.COMMUNICATION,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
};
```

## Error Handling

### Retry Logic
```typescript
async triggerCommunicationWithRetry(payload: CommunicationPayload) {
  try {
    return await this.triggerCommunication(payload);
  } catch (error) {
    this.logger.error(`Communication failed: ${error.message}`);
    
    // Retry with exponential backoff
    if (this.shouldRetry(error)) {
      await this.queue.add(
        JOBS.ACTIVITIES.COMMUNICATION.TRIGGER,
        payload,
        {
          delay: this.calculateRetryDelay(),
          attempts: 3
        }
      );
    }
    
    throw error;
  }
}
```

### Error Types
```typescript
enum CommunicationError {
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  TRANSPORT_UNAVAILABLE = 'TRANSPORT_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PROVIDER_ERROR = 'PROVIDER_ERROR'
}
```

## Monitoring and Analytics

### Communication Metrics
```typescript
interface CommunicationMetrics {
  totalSent: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  averageDeliveryTime: number;
}
```

### Session Tracking
```typescript
async getCommunicationSessionDetails(sessionId: string) {
  return {
    sessionId,
    status: await this.commsClient.broadcast.getStatus(sessionId),
    logs: await this.commsClient.broadcast.getSessionLogs(sessionId),
    recipients: await this.commsClient.broadcast.getRecipients(sessionId),
    deliveryStats: await this.commsClient.broadcast.getDeliveryStats(sessionId)
  };
}
```

## Security and Privacy

### Data Protection
- **Encryption**: All communication data encrypted in transit
- **PII Handling**: Phone numbers and emails stored securely
- **Consent Management**: Recipient consent tracking
- **Audit Logging**: All communication activities logged

### Access Control
```typescript
interface CommunicationPermissions {
  canSendSMS: boolean;
  canSendEmail: boolean;
  canSendVoice: boolean;
  canViewLogs: boolean;
  canManageTransports: boolean;
}
```

## Configuration Management

### Environment Variables
```bash
# Communication Service Configuration
COMMUNICATION_URL=https://connect.rumsan.com
COMMUNICATION_APP_ID=rahat-aa
COMMUNICATION_ACCESS_TOKEN=your_access_token

# Transport Provider Configuration
SMS_PROVIDER_API_KEY=your_sms_api_key
EMAIL_PROVIDER_API_KEY=your_email_api_key
VOICE_PROVIDER_API_KEY=your_voice_api_key
```

### Settings Management
```typescript
// Communication settings stored in database
interface CommunicationSettings {
  URL: string;
  APP_ID: string;
  ACCESS_TOKEN: string;
  DEFAULT_TRANSPORT: string;
  RATE_LIMITS: {
    SMS_PER_HOUR: number;
    EMAIL_PER_HOUR: number;
    VOICE_PER_HOUR: number;
  };
}
```

