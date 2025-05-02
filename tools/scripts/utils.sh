current_dir="$PWD"

create_env() {
    declare -a projectDirs=(
        "$current_dir"
    )

    for project in "${projectDirs[@]}"; do
        env_file="$project/.env"
        example_content=$(<"$project/.env.example")
        echo "$example_content" >"$env_file"
    done
}

setup() {
    pnpm migrate
    pnpm seed:aa $current_dir
    pnpm seed:contract
    pnpm seed:networks $current_dir
    pnpm seed:stellar
    pnpm seed:all
}

graph_setup() {
    pnpm graph:create-local
    graph_url=$(pnpm graph:deploy-local | grep -o 'http://[^ ]*' | tail -1)
    export graph_url
}

seed_settings() {
    pnpm seed:settings $graph_url
}

drop_pg_database() {
    CONTAINER_NAME=postgres-rahat
    DB_NAME=$1
    docker exec -i "$CONTAINER_NAME" psql -U "rahat" -c "DROP DATABASE \"rahat-aa\" WITH (FORCE);"
}

rm_modules() {
    rm -rf dist node_modules tmp
}

gen_prisma() {
    pnpm prisma:generate
}
