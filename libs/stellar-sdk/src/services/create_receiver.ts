import { ASSET } from "../constants/asset";
import { create_receiver_account } from "../scripts/receiver/create_receiver_account";
import { add_trustline } from "../scripts/stellar/add_trustline";
import { faucet } from "../scripts/stellar/faucet";
import { get_account_balance } from "../utils/get_account_balance";
import { get_balance } from "../utils/get_balance";

export class ReceiverService {
    private assetIssuer: string;
    private assetCode: string;

    constructor(assetIssuer: string = ASSET.ISSUER, assetCode: string = ASSET.NAME) {
        this.assetIssuer = assetIssuer;
        this.assetCode = assetCode;
    }

    public async createReceiverAccount(): Promise<any> {
        const keypair = await create_receiver_account();
        //@ts-ignore
        await this.addTrustline(keypair?.publicKey as string, keypair?.secretKey as string);
        return keypair;
    }

    public async getBalance(walletAddress: string) {
        const customTokenBalance = await get_balance(walletAddress);
        return customTokenBalance;
    }

    public async faucetService(walletAddress: string){
        return faucet(walletAddress);
    }

    private async addTrustline(publicKey: string, secretKey: string): Promise<void> {
        await add_trustline(publicKey, secretKey, this.assetIssuer, this.assetCode);
    }
}
