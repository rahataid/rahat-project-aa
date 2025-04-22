import { logger } from "../../logger"
import { generate_account } from "../stellar/create_account"
import { faucet } from "../stellar/faucet"

export const create_receiver_account = async () => {

    try {
    logger.info("Creating keypair for receiver")
    const keypair = generate_account()

    await faucet(keypair.publicKey) 
    return keypair
    
    } catch (error) {
        return error;
    }
    
}