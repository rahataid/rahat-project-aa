//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

interface IRahatTreasury{
    struct Treasury{
        string year;
        uint256 budget;
        string country;
    }

function createTreasury(string memory year, uint256 budget, string memory country) external returns(uint treasuryId);

function checkBudget(uint _treasuryId) external returns(Treasury memory treasurydetails);

function increaseBudget(uint _treasuryId, uint256 _increaseAmount) external;

function redeemToken(uint _treasuryId, uint256 _amount) external;


}