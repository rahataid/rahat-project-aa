# Rahat Anticipatory Action

## Prerequisite

-Postgres Database OR docker compose
-Node.js
-NestJS/CLI installed
-Redis Server or Docker compose

## Run locally

Step1: Clone project
Step2: Go to the project directory and install the dependenciess

```bash
pnpm install
```

Step3: Create .env files with details as in .env sample file
Step4: Copy paste project specific schema to schema.prisma and run migration

```bash
npx prisma migrate dev
```

Step4: Run project

```bash
pnpm serve:aa
```
