#! /bin/bash

pnpm i

source ./tools/scripts/utils.sh
source ./tools/scripts/deploy-soroban.sh

soroban_deploy

create_env
gen_prisma
setup
graph_setup
seed_settings
