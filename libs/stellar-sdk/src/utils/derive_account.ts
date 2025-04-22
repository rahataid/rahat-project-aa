const bip39 = import('bip39');
import { default as BIP32Factory } from 'bip32';
import * as tinysecp from 'tiny-secp256k1';
import StellarSdk from 'stellar-sdk';
import { HDNodeWallet, Mnemonic } from 'ethers';

const bip32 = BIP32Factory(tinysecp);

export const derive_account = async (mnemonics: string, index: number) => {

    
const newBIp = await bip39;

const seed = await newBIp.mnemonicToSeed(mnemonics);

const deriveAccount = (index: any) => {
    const path = `m/44'/148'/0'/${index}'`;
    const root = bip32.fromSeed(seed);
    const child = root.derivePath(path);
    return StellarSdk.Keypair.fromRawEd25519Seed(child.privateKey);
};

getWalletUsingMnemonicAtPath(mnemonics, `m/44'/148'/0'/${index}'`)

return await deriveAccount(index);
}

export function getWalletUsingMnemonicAtPath(mnemonic: string, path: string): HDNodeWallet {
    const mnemonicWallet = Mnemonic.fromPhrase(mnemonic);
    const wallet = HDNodeWallet.fromMnemonic(mnemonicWallet);
    wallet.derivePath("m/44'/148'/0'/0/0")
    console.log("Keys from ethers: ", wallet)
    return wallet;
  }