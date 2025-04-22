import {Keypair, Asset} from "@stellar/stellar-sdk"
import { ASSET } from "../../constants/asset";
export const create_asset = async (asset_name: string) => {
    const issuerKeypair = Keypair.fromSecret(ASSET.SECERT);
    return new Asset(asset_name, issuerKeypair.publicKey());    
  }