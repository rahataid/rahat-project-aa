import { Horizon } from "@stellar/stellar-sdk";
import { horizon_server } from "../../constants/horizon_server";

export const get_asset_details = async (public_key: string) => {
    const server = new Horizon.Server(horizon_server);

    return await server.loadAccount(public_key)

}