//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './RahatToken.sol';
import '@rahataid/contracts/src/rahat-app/libraries/AbstractTokenActions.sol';
import '../interfaces/IAAProject.sol';
import '../interfaces/IRahatDonor.sol';
import '../interfaces/IRahatTreasury.sol';
import '../interfaces/IAccessManager.sol';

/// @title Donor contract to create tokens
/// @author Rumsan Associates
/// @notice You can use this contract to manage Rahat tokens and projects
/// @dev All function calls are only executed by contract owner
contract RahatDonor is AbstractTokenActions, ERC165 {
  event TokenCreated(address indexed tokenAddress);
  event TokenMintedAndApproved(
    address indexed tokenAddress,
    address indexed approveAddress,
    uint256 amount
  );

  /// @notice All the supply is allocated to this contract
  /// @dev deploys AidToken and Rahat contract by sending supply to this contract

  bytes4 public constant IID_RAHAT_DONOR = type(IRahatDonor).interfaceId;
  mapping(uint256 => uint256) public tokenToDollarValue;

  mapping(address => bool) public _registeredProject;

  IRahatTreasury public RahatTreasury;
  IAccessManager public AccessManager;

  constructor(address _admin, address _accessManager) {
    _addOwner(_admin);
    AccessManager = IAccessManager(_accessManager);
    // RahatTreasury = IRahatTreasury(_treasury);
    // tokenToDollarValue[1] = averageDollarValue;
  }

  //#region Token function
  // function createToken(
  //   string memory _name,
  //   string memory _symbol,
  //   uint8 decimals
  // ) public  returns (address) {
  //   RahatToken _token = new RahatToken(_name, _symbol, address(this), decimals);
  //   address _tokenAddress = address(_token);
  //   emit TokenCreated(_tokenAddress);
  //   return _tokenAddress;
  // }

  modifier onlyDonor() {
    require(AccessManager.isDonor(msg.sender), 'Caller is not a donor');
    _;
  }

  function mintToken(address _token, uint256 _amount) public {
    RahatToken(_token).mint(address(this), _amount);
  }

  function mintTokenAndApprove(
    address _tokenFree,
    address _tokenReferral,
    address _projectAddress,
    uint256 _amountFree,
    uint256 _referralLimit
  ) public onlyDonor {
    require(_tokenFree != address(0), 'token address cannot be zero');
    require(_tokenReferral != address(0), 'token address cannot be zero');
    require(_projectAddress != address(0), 'approve address cannot be zero');
    require(_registeredProject[_projectAddress], 'project not registered');
    require(_amountFree > 0, 'amount cannot be zero');
    require(
      mintTokens(_tokenFree, _projectAddress, _amountFree),
      'Free token not minted'
    );
    uint256 _tokenReferralAmount = _amountFree * _referralLimit;
    require(
      mintTokens(_tokenReferral, _projectAddress, _tokenReferralAmount),
      'Referred token not minted'
    );
  }

  function mintTokens(
    address _token,
    address _projectAddress,
    uint256 _amount
  ) private returns (bool) {
    RahatToken token = RahatToken(_token);
    token.mint(_projectAddress, _amount);

    IAAProject(_projectAddress).increaseTokenBudget(_token, _amount);
    emit TokenMintedAndApproved(_token, _projectAddress, _amount);

    return true;
  }

  function mintTokenAndApproveDescription(
    address _tokenFree,
    address _tokenReferral,
    address _projectAddress,
    uint256 _amountFree,
    string memory _descriptionFree,
    string memory _descriptionReferral,
    uint256 _priceFree,
    uint256 _priceReferral,
    uint256 _referralLimit,
    string memory _currency
  ) public onlyDonor {
    require(_tokenFree != address(0), 'token address cannot be zero');
    require(_tokenReferral != address(0), 'token address cannot be zero');
    require(_projectAddress != address(0), 'approve address cannot be zero');
    require(_registeredProject[_projectAddress], 'project not registered');
    require(_amountFree > 0, 'amount cannot be zero');
    require(
      mintAndUpdateParams(
        _tokenFree,
        _projectAddress,
        _amountFree,
        _descriptionFree,
        _priceFree,
        _currency
      ),
      'amount cannot be zero'
    );
    uint256 freeReferral = _amountFree * _referralLimit;
    require(
      mintAndUpdateParams(
        _tokenReferral,
        _projectAddress,
        freeReferral,
        _descriptionReferral,
        _priceReferral,
        _currency
      ),
      ''
    );
  }

  function mintAndUpdateParams(
    address _token,
    address _projectAddress,
    uint256 _amount,
    string memory _description,
    uint256 _price,
    string memory _currency
  ) private returns (bool) {
    RahatToken token = RahatToken(_token);
    token.mint(_projectAddress, _amount);
    token.updateTokenParams(_currency, _price, _description);

    IAAProject(_projectAddress).increaseTokenBudget(_token, _amount);
    emit TokenMintedAndApproved(_token, _projectAddress, _amount);

    return true;
  }

  function addTokenOwner(address _token, address _ownerAddress) public {
    RahatToken(_token).addOwner(_ownerAddress);
  }

  function registerProject(address _projectAddress, bool status) public {
    _registeredProject[_projectAddress] = status;
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override returns (bool) {
    return
      interfaceId == IID_RAHAT_DONOR || super.supportsInterface(interfaceId);
  }

  //#endregion
}
