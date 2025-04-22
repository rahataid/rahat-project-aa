import {Keypair} from '@stellar/stellar-sdk'
import { logger } from '../../logger'

export const generate_account = () => {
    const account = Keypair.random()

    const accountDetails = {
       secretKey: account.secret(),
       publicKey: account.publicKey()
    }

    logger.info('-----------------------------')
    logger.warn('Generated acoount successfully.')
    logger.info(`Public Key: ${account.publicKey()}`)
    logger.info(`Secret Key: ${account.secret()}`)
    logger.info('-----------------------------')

    return accountDetails;
}