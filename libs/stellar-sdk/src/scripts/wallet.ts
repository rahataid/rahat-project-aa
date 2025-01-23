import { faucet } from './stellar/faucet';
import { get_account_balance } from '../utils/get_account_balance';
import { derive_account } from '../utils/derive_account';
import { logger } from '../logger';

require("dotenv").config();

const getBIP = async (mnemonics: string) => {

const account1 = await derive_account(mnemonics, 0)

logger.info(`Account 1 - Public Key: ${account1.publicKey()}`);
logger.info(`Account 1 - Secret Key: ${account1.secret()}`);

await faucet(account1.publicKey()) 

await get_account_balance(account1.publicKey());

}

getBIP('crater runway system easy ranch sail lucky evidence slide owner dune charge')

