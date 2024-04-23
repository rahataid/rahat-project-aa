//SPDX-License-Identifier: LGPL-3.0

import "../interfaces/IRahatTreasury.sol";

pragma solidity 0.8.23;

contract RahatTreasury is IRahatTreasury{
    event TreasuryCreated(string indexed year, uint256 budget, string indexed country);
    event BudgetIncreased(uint indexed treasuryId, uint256 increasedamount);
    event BudgetRedeemed(uint indexed treasuryId, uint256 amount);

    mapping(uint256 => Treasury) public treasury;
    uint256 public treasuryCount;

    function createTreasury(string memory _year, uint256 _budget, string memory _country) public override returns(uint treasuryId){
        treasuryId = ++treasuryCount;
        treasury[treasuryId] = Treasury({
            year : _year,
            budget : _budget,
            country :_country
        });
        emit TreasuryCreated(_year,_budget,_country);
    }

    function checkBudget(uint256 _treasuryId) public view  returns(Treasury memory treasuryDetails){
        treasuryDetails =  treasury[_treasuryId];
        return treasuryDetails;
    }

    function increaseBudget(uint256 _treasuryId, uint256 _amount) public{
        Treasury storage _treasury = treasury[_treasuryId];
        require(bytes(_treasury.country).length>0, "treasury:budget not created");
        _treasury.budget = _treasury.budget + _amount;
        emit BudgetIncreased(_treasuryId, _amount);

    }

    function redeemToken(uint256 _treasuryId, uint256 _amount) public{
        Treasury storage _treasury = treasury[_treasuryId];
        require(bytes(_treasury.country).length>0, "treasury:budget not created");
        _treasury.budget = _treasury.budget - _amount;
        emit BudgetRedeemed(_treasuryId, _amount);
    }
}


