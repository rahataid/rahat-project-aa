import axios from "axios"
import { logger } from "../../logger"

export const faucet = async (publicKey: string) => {
    try {
        
        await axios.get(`${process.env['FRIEND_BOT_STELLAR']}?addr=${publicKey}`)
        logger.info('----------------------------------')
        logger.warn('Created receiver account successfully')
        logger.warn('Funded receiver account with 10,000 XLM')
        logger.info('----------------------------------')
        return {message: 'Funded successfully'}
    } catch (error:any) {
        logger.warn("Account already funded, skipping funding...")
        return {message: 'Account already funded'}
    }
}