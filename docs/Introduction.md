# Rahat Anticipatory Action (AA) - Introduction

## Overview

Rahat Anticipatory Action (AA) is a decentralized platform designed to enhance community resilience against climate shocks through automated trigger management, beneficiary support, and intelligent response systems. This project represents a comprehensive solution for climate-related humanitarian interventions, combining blockchain technology with real-time environmental monitoring.

## Core Mission

The platform addresses the critical need for timely humanitarian assistance in climate-vulnerable regions by:

- **Proactive Response**: Automatically triggering assistance before disasters strike
- **Multi-source Intelligence**: Integrating diverse environmental data sources for accurate forecasting
- **Blockchain-based Aid**: Ensuring transparent and efficient distribution of financial assistance
- **Community Resilience**: Building long-term capacity through systematic intervention

## Key Features

### 🌊 Climate Risk Management
- Real-time monitoring of weather patterns and hydrological data
- Automated analysis of environmental indicators
- Predictive modeling for disaster preparedness

### 🎯 Automated Triggers
- Configurable hazard indicators and thresholds
- Multi-parameter trigger conditions
- Automated response activation based on environmental data

### 💰 Financial Assistance
- Cash and voucher assistance programs
- Blockchain-based token distribution
- Offramp services for local currency conversion

### 📊 Multi-source Forecasting
- Integration with multiple environmental data providers
- Real-time data synchronization
- Advanced probability modeling

### 🔗 Dual Blockchain Integration
- Support for both Stellar Soroban and EVM-compatible networks
- Smart contract deployment on multiple chains
- Cross-chain interoperability

### 👥 Beneficiary Management
- Comprehensive beneficiary tracking and support
- Group-based assistance programs
- Real-time communication systems

## External Services & Integrations

### Environmental Data Sources

#### 1. Department of Hydrology and Meteorology (DHM)
- **Purpose**: Real-time river water level monitoring
- **Integration**: Direct API integration for hydrological data
- **Data Points**: Water levels, river flow rates, station information
- **Update Frequency**: Every 5 minutes
- **Use Case**: Flood prediction and early warning systems

#### 2. Global Flood Awareness System (GLOFAS)
- **Purpose**: Global flood forecasting and monitoring
- **Integration**: REST API with XML data parsing
- **Data Points**: Return period tables, probability forecasts, lead time analysis
- **Update Frequency**: Hourly synchronization
- **Use Case**: Advanced flood probability assessment and lead time analysis

### Communication Services

#### 3. @rumsan/connect Communication Platform
- **Purpose**: Multi-channel communication delivery
- **Integration**: Microservice communication via Redis
- **Channels**: SMS, Email, Voice calls
- **Features**: 
  - Broadcast messaging to beneficiaries and stakeholders
  - Session-based communication tracking
  - Transport-specific message formatting
  - Real-time delivery status monitoring

### Financial Services

#### 4. Offramp Services
- **Purpose**: Token-to-fiat conversion and local payment processing
- **Integration**: REST API with authentication
- **Services**:
  - Instant token-to-cash conversion
  - Bank account transfers
  - VPA (Virtual Payment Address) payments
  - CIPS (Cross-border Interbank Payment System) integration

#### 5. Payment Providers
- **Purpose**: Local financial service provider integration
- **Features**:
  - Multiple payment provider support
  - Bank account validation
  - Transaction status tracking
  - Payment method selection

### Blockchain Networks

#### 6. Stellar Network
- **Purpose**: Primary blockchain for token operations
- **Features**:
  - Soroban smart contracts for trigger management
  - Native asset creation and distribution
  - Low transaction costs
  - Fast finality (3-5 seconds)
- **Smart Contracts**: Trigger management, token distribution, beneficiary wallets

#### 7. EVM-Compatible Networks
- **Purpose**: Alternative blockchain deployment options
- **Supported Networks**:
  - Polygon (Amoy testnet)
  - Arbitrum (Sepolia testnet)
  - Ethereum mainnet
  - Local development networks
- **Features**: DeFi integration, complex smart contract interactions

### Core Platform Dependencies

#### 8. Rahat Platform (Core Services)
- **Purpose**: Foundational services and APIs
- **Services**:
  - Core API at `http://localhost:5501`
  - Beneficiary management
  - Database management
  - Authentication services
  - Settings management

#### 9. Rahat Triggers Service
- **Purpose**: Automated response and monitoring
- **Services**:
  - Activity management
  - Trigger engine
  - Forecasting integration
  - Communication hub

### Infrastructure Services

#### 10. PostgreSQL Database
- **Purpose**: Primary data storage
- **Features**: Multi-database architecture supporting core, triggers, and AA databases
- **ORM**: Prisma for type-safe database operations

#### 11. Redis
- **Purpose**: Caching and microservice communication
- **Features**: 
  - Session management
  - Queue management (Bull/BullMQ)
  - Inter-service communication

#### 12. The Graph Protocol
- **Purpose**: Blockchain data indexing and querying
- **Features**:
  - Subgraph deployment for blockchain event tracking
  - Real-time data indexing
  - GraphQL API for blockchain data queries

## Architecture Overview

The platform follows a microservices architecture with the following key components:

### Application Layer
- **NestJS Framework**: Scalable Node.js backend
- **Nx Monorepo**: Efficient development and build management
- **TypeScript**: Type-safe development across the stack

### Data Layer
- **Prisma ORM**: Database abstraction and migrations
- **Multi-database Setup**: Separate databases for core, triggers, and AA services
- **Redis**: Caching and inter-service communication

### Blockchain Layer
- **Dual Chain Support**: Stellar Soroban and EVM networks
- **Smart Contracts**: Automated trigger execution and token management
- **The Graph**: Blockchain data indexing and querying

### External Integrations
- **Environmental APIs**: DHM and GLOFAS for climate data
- **Communication Platform**: @rumsan/connect for messaging
- **Financial Services**: Offramp and payment provider APIs

## Use Cases

### 1. Flood Early Warning System
- **Trigger**: Water level exceeds threshold
- **Response**: Automated beneficiary notification and cash distribution
- **Data Sources**: DHM river stations, GLOFAS forecasting

### 2. Drought Response
- **Trigger**: Rainfall probability below threshold
- **Response**: Voucher distribution for agricultural support
- **Data Sources**: Meteorological forecasts, soil moisture data

### 3. Cyclone Preparedness
- **Trigger**: Storm probability and wind speed indicators
- **Response**: Emergency cash assistance and evacuation support
- **Data Sources**: Weather forecasting services, satellite data

## Technology Stack

### Backend
- **Framework**: NestJS (Node.js)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Queue**: Bull/BullMQ

### Blockchain
- **Stellar**: Soroban smart contracts (Rust)
- **EVM**: Solidity smart contracts
- **SDKs**: Stellar SDK, Ethers.js

### External Services
- **Communication**: @rumsan/connect
- **Environmental Data**: DHM API, GLOFAS API
- **Financial**: Offramp services, Payment providers

### Development Tools
- **Monorepo**: Nx
- **Package Manager**: pnpm
- **Testing**: Jest
- **Documentation**: Swagger/OpenAPI
