[![Coverage Status](https://coveralls.io/repos/github/rahataid/rahat-project-aa/badge.svg?branch=main)](https://coveralls.io/github/rahataid/rahat-project-aa?branch=main)

# Rahat Anticipatory Action (AA)

A decentralized platform for managing anticipatory action projects to enhance community resilience against climate shocks. This project provides fund management management, beneficiary support, and automated response systems for climate-related humanitarian interventions.

## Table of Contents
- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Dependencies Setup](#dependencies-setup)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Available Scripts](#available-scripts)
- [Development Guide](#development-guide)
- [Testing](#testing)
- [API Documentation](#api-documentation)

## Project Overview

Rahat Anticipatory Action is part of the Rahat ecosystem that focuses on:

- 🌊 **Climate Risk Management**: Monitor weather patterns and hydrological data
- 🎯 **Automated Triggers**: Configure hazard indicators and automated responses
- 💰 **Financial Assistance**: Manage cash/voucher assistance programs
- 📊 **Multi-source Forecasting**: Integrate data from DHM, GLOFAS, and other sources
- 🔗 **Dual Blockchain Integration**: Support for both Stellar Soroban and EVM-compatible networks
- 💎 **Smart Contracts**: Deploy on Stellar Soroban or EVM chains (Polygon, Arbitrum, etc.)
- 👥 **Beneficiary Management**: Track and support vulnerable communities

## Architecture

The project is built using:
- **NestJS**: Scalable Node.js framework
- **Prisma**: Database ORM with PostgreSQL
- **Redis**: Caching and session management
- **Bull/BullMQ**: Queue management for background jobs
- **Stellar SDK**: Blockchain integration for Stellar Soroban smart contracts
- **Ethers.js**: EVM blockchain integration for Ethereum-compatible networks
- **Nx**: Monorepo tooling for scalable development

## Prerequisites

Before setting up this project, ensure you have:

- **Node.js**: Version 20.10.0 or higher
- **pnpm**: Version 8+ (preferred package manager)
- **Docker**: Version 20.10.7 or higher (for services)
- **PostgreSQL**: Version 13+ (or Docker)
- **Redis**: Version 6+ (or Docker)
- **Git**: For version control
- **Rust**: For Soroban smart contract development (optional)
- **Stellar CLI**: For Stellar/Soroban contract deployment (optional)

## Dependencies Setup

This project requires two other Rahat services to be running:

### 1. Rahat Platform (Core Services)

The core platform provides foundational services and APIs.

```bash
# Clone the platform repository
git clone https://github.com/rahataid/rahat-platform.git
cd rahat-platform

# Bootstrap all core services (installs dependencies and starts Docker services)
pnpm bootstrap

# Start core services (run in separate terminals)
pnpm rahat
pnpm beneficiary
```

**Platform Services Include:**
- Core API at `http://localhost:5501`
- Beneficiary services
- Database management
- Authentication services

### 2. Rahat Triggers

The triggers service handles automated responses and monitoring.

```bash
# Clone the triggers repository
git clone https://github.com/rahataid/rahat-project-triggers.git
cd rahat-project-triggers

# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env

# Start the service
pnpm dev
```

**Triggers Services Include:**
- Activity management
- Trigger engine
- Forecasting integration
- Communication hub

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rahataid/rahat-project-aa.git
   cd rahat-project-aa
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Copy environment configuration**
   ```bash
   cp .env.example .env
   ```

## Configuration

Update the `.env` file with your environment-specific values:

```ini
# Project Configuration
PROJECT_ID=45606343-e6f5-475f-a2b3-f31d6ab10733

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6666
REDIS_PASSWORD=rahat123

# Database Configuration
DB_HOST=localhost
DB_PORT=5555
DB_USERNAME=rahat
DB_PASSWORD=rahat123
DB_NAME=rahat-aa
DB_RAHAT_CORE=rahat-platform-nx
DB_RAHAT_TRIGGERS=rahat-triggers

# Database URLs
DATABASE_URL=postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public
CORE_DATABASE_URL=postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_RAHAT_CORE}?schema=public
TRIGGER_DATABASE_URL=postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_RAHAT_TRIGGERS}?schema=public

# Project Settings
ACTIVE_YEAR=2024
RIVER_BASIN=Karnali

# Stellar Configuration (for blockchain operations)
SDP_VERIFICATION_PIN=
BASE_URL=
ADMIN_BASE_URL=
RECERIVER_BASE_URL=
FRIEND_BOT_STELLAR=
STELLAR_DEMO_WALLET=
HORIZON_URL=
FUNDING_AMOUNT=

# EVM Configuration (uncomment to use EVM chains)
# NETWORK_PROVIDER=http://127.0.0.1:8888
# CHAIN_NAME=localhost
# CHAIN_ID=8888
# CURRENCY_NAME=ETH
# CURRENCY_SYMBOL=ETH
# DEPLOYER_PRIVATE_KEY=your_private_key
# RAHAT_ADMIN_PRIVATE_KEY=your_admin_private_key
```

## Database Setup

1. **Generate Prisma client**
   ```bash
   pnpm prisma:generate
   ```

2. **Run database migrations**
   ```bash
   pnpm migrate
   ```

3. **Seed the database (optional)**
   ```bash
   # Seed all data
   pnpm seed:all
   
   # Or seed specific components
   pnpm seed:aa
   pnpm seed:stellar
   ```

## Running the Application

### Development Mode
```bash
# Start the application in development mode with hot reload
pnpm dev
```

### Production Mode
```bash
# Build the application
pnpm build:all

# Start the production server
pnpm start
```

The application will be available at `http://localhost:3000` (or the port specified in your configuration).

## Available Scripts

### Development
- `pnpm dev` - Start development server with hot reload
- `pnpm start` - Start production server
- `pnpm build:all` - Build all applications

### Database Management
- `pnpm migrate` - Run database migrations
- `pnpm migrate:dev` - Run migrations in development
- `pnpm migrate:reset` - Reset database and migrations
- `pnpm prisma:studio` - Open Prisma Studio for database management
- `pnpm prisma:generate` - Generate Prisma client

### Testing
- `pnpm test:aa` - Run unit tests
- `pnpm test:aa --coverage` - Run unit tests with coverage 
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm test:cov` - Run tests with coverage

### Triggers and Automation
- `pnpm trigger-activation` - Trigger activation processes
- `pnpm trigger-readiness` - Trigger readiness processes

### Smart Contracts
- `pnpm contracts:compile` - Compile EVM smart contracts (Solidity)
- `pnpm contracts:test` - Test EVM smart contracts
- `pnpm contracts:deploy:amoy` - Deploy to Polygon Amoy testnet

### Soroban Contracts (Stellar)
- `stellar contract build` - Build Soroban contracts (from soroban/trigger directory)
- `stellar contract deploy` - Deploy Soroban contracts to Stellar network
- `stellar network add` - Add Stellar network configuration

### Graph Protocol
- `pnpm graph:create-local` - Create local subgraph
- `pnpm graph:deploy-local` - Deploy subgraph locally

## Development Guide

### Project Structure
```
apps/
├── aa/                 # Main Anticipatory Action application
├── aa-e2e/            # End-to-end tests
├── contracts/         # EVM smart contracts (Solidity)
└── graph/             # The Graph Protocol subgraph

libs/
├── cva/               # Cash and Voucher Assistance library
└── stellar-sdk/       # Stellar blockchain integration

soroban/
└── trigger/           # Soroban smart contracts (Rust)

prisma/
├── schema.prisma      # Database schema
├── migrations/        # Database migrations
└── seed*.ts          # Database seeding scripts
```

### Adding New Features
1. Create feature branches from `main`
2. Follow NestJS module structure
3. Add appropriate tests
4. Update documentation
5. Submit pull request

### Database Schema Updates
1. Modify `prisma/schema.prisma`
2. Create migration: `pnpm migrate:dev:create`
3. Apply migration: `pnpm migrate`
4. Update seed files if necessary

## Blockchain Integration

This project supports dual blockchain integration, allowing deployment on both Stellar Soroban and EVM-compatible networks:

### Stellar Soroban Contracts
Located in `soroban/trigger/`, these Rust-based smart contracts provide:
- Trigger management on Stellar network
- Native integration with Stellar assets
- Low transaction costs and fast finality

**Setup Requirements:**
```bash
# Install Stellar CLI
brew install stellar-cli

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Build contracts (from soroban/trigger directory)
cd soroban/trigger
stellar contract build
```

### EVM Smart Contracts
Located in `apps/contracts/`, these Solidity contracts support:
- Deployment on Polygon, Arbitrum, Ethereum, and other EVM chains
- Integration with existing DeFi ecosystems
- Comprehensive testing with Hardhat

**Supported Networks:**
- Polygon Amoy (Testnet)
- Arbitrum Sepolia (Testnet)
- Local development networks

**Contract Operations:**
```bash
# Compile contracts
pnpm contracts:compile

# Run tests
pnpm contracts:test

# Deploy to testnet
pnpm contracts:deploy:amoy
```

### Choosing Your Blockchain

**Use Stellar Soroban when:**
- You need low transaction costs
- Fast transaction finality is important
- Working with Stellar-native assets
- Building for emerging markets

**Use EVM chains when:**
- You need extensive DeFi integration
- Working with existing Ethereum ecosystem
- Require complex smart contract interactions
- Need established tooling and infrastructure

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:cov

# Run end-to-end tests
pnpm test:e2e

# Test EVM contracts
pnpm contracts:test

# Test Soroban contracts (from soroban/trigger directory)
cd soroban/trigger && stellar contract test
```

## API Documentation

Once the application is running, you can access:
- **API Documentation**: `http://localhost:3000/swagger` (when running locally)
- **Database Studio**: Run `pnpm prisma:studio` to open Prisma Studio

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Ensure PostgreSQL is running
   - Check database credentials in `.env`
   - Verify database exists

2. **Redis Connection Errors**
   - Ensure Redis server is running
   - Check Redis configuration in `.env`

3. **Dependency Services Not Running**
   - Make sure rahat-platform is running
   - Verify rahat-triggers service is active
   - Check service endpoints in configuration

### Getting Help
- Check the [Issues](https://github.com/rahataid/rahat-project-aa/issues) page
- Review the platform documentation
- Contact the development team

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MPL-2.0 License - see the LICENSE file for details.
