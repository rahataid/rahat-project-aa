import { axiosInstance } from "../../utils/axiosInstance"

export const get_wallet_info = async (walletType: string, assetCodes: string) => {
    const walletRes = await axiosInstance.get(`${process.env.BASE_URL}/wallets`)

    const {id: walletId, assets} = walletRes.data.find((wallet: any) => wallet.name === walletType);
    const asset = assets.find((asset: any) => asset.code === assetCodes);

    console.log(asset)
}