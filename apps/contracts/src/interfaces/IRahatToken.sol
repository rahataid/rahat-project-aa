//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@rahataid/contracts/src/rahat-app/interfaces/IOwner.sol";

interface IRahatToken is IOwner, IERC20 {
    function mint(address _address, uint256 _amount) external returns(uint256);
    function burnFrom(address _account, uint256 _amount) external;
    
}