//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

//ERC20 Tokens
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '../interfaces/IRahatToken.sol';
import '@rahataid/contracts/src/rahat-app/libraries/AbstractOwner.sol';
import '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import '@openzeppelin/contracts/metatx/ERC2771Forwarder.sol';

contract RahatToken is
    AbstractOwner,
    ERC20,
    ERC20Burnable,
    IRahatToken,
    ERC2771Context
{
    uint8 private decimalPoints;
    string public description;
    uint256 public price;
    string public currency;

    event UpdatedDescription(address updatedBy, string description);
    event UpdatedTokenParams(string currency, uint256 price);

    constructor(
        address _forwarder,
        string memory _name,
        string memory _symbol,
        address _admin,
        uint8 _decimals
    ) ERC20(_name, _symbol) ERC2771Context(address(_forwarder)) {
        _addOwner(_admin);
        decimalPoints = _decimals;
    }

    ///@dev returns the decimals of the tokens
    function decimals() public view override returns (uint8) {
        return decimalPoints;
    }

    ///@dev Update price and currency of token
    ///@param _currency Currency to which token will be change
    ///@param _price Price of currency
    ///@param _price Voucher description
    function updateTokenParams(
        string memory _currency,
        uint256 _price,
        string memory _description
    ) public {
        price = _price;
        currency = _currency;
        description = _description;
        emit UpdatedTokenParams(currency, price);
    }

    ///@dev Mint x amount of ERC20 token to given address
    ///@param _address Address to which ERC20 token will be minted
    ///@param _amount Amount of token to be minted
    function mint(
        address _address,
        uint256 _amount
    ) public override OnlyOwner returns (uint256) {
        _mint(_address, _amount);
        return _amount;
    }

    function burnFrom(
        address _account,
        uint256 _value
    ) public override(ERC20Burnable, IRahatToken) {
        super.burnFrom(_account, _value);
    }

    function updateDescription(string memory _description) public {
        description = _description;
        emit UpdatedDescription(msg.sender, _description);
    }

    /// @dev overriding the method to ERC2771Context
    function _msgSender()
        internal
        view
        override(Context, ERC2771Context)
        returns (address sender)
    {
        sender = ERC2771Context._msgSender();
    }

    /// @dev overriding the method to ERC2771Context
    function _msgData()
        internal
        view
        override(Context, ERC2771Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength()
        internal
        view
        override(Context, ERC2771Context)
        returns (uint256)
    {
        return ERC2771Context._contextSuffixLength();
    }

    // function _beforeTokenTransfer(
    //   address from,
    //   address to,
    //   uint256 amount
    // ) internal override(ERC20) {
    //   super._beforeTokenTransfer(from, to, amount);
    // }
}
