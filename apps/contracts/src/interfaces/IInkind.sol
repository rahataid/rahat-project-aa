pragma solidity 0.8.23;

interface IInkind {
    function redeemInkind(bytes16[] calldata _inkind, address _vendor, address _beneficiary, uint256 _inkindsValue) external;
}