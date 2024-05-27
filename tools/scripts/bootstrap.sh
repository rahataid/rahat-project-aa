#! /bin/bash

pnpm i

source ./tools/scripts/utils.sh

create_env
gen_prisma
setup
graph_setup
seed_settings
