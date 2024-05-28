//SPDX-License-Identifier: LGPL-3.0

pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

interface IAAProject is IERC165 {
    function addBeneficiary(address _address) external;

    function removeBeneficiary(address _address) external;

    function increaseTokenBudget(address _token, uint256 _amount) external;
}
