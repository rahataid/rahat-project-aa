const ethers = require('ethers');

// Function to generate random Ethereum addresses
function generateRandomEthAddress() {
    const wallet = ethers.Wallet.createRandom();
    return wallet.address;
};

function getRandomEthAddress(length) {
    return Array.from({ length }, () => generateRandomEthAddress())
}

function getRandomDonorData(tokenAddress, referredTokenAddress, projectAddress, mintAmount, referralLimit, description) {
    return [
        [tokenAddress, referredTokenAddress, projectAddress, mintAmount, `${description} - Free`,  `${description} - Referred`, 10, 1, referralLimit, 'USD'],
        [tokenAddress, referredTokenAddress, projectAddress, mintAmount, `${description} - Free`,  `${description} - Referred`, 10, 1, referralLimit, 'USD'],
        [tokenAddress, referredTokenAddress, projectAddress, mintAmount, `${description} - Free`,  `${description} - Referred`, 10, 1, referralLimit, 'USD'],
        [tokenAddress, referredTokenAddress, projectAddress, mintAmount, `${description} - Free`,  `${description} - Referred`, 10, 1, referralLimit, 'USD'],
        [tokenAddress, referredTokenAddress, projectAddress, mintAmount, `${description} - Free`,  `${description} - Referred`, 10, 1, referralLimit, 'USD'],
    ]
}

module.exports = {getRandomEthAddress, getRandomDonorData};