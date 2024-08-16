//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './RahatToken.sol';
import '@rahataid/contracts/src/rahat-app/libraries/AbstractTokenActions.sol';
import '../interfaces/IAAProject.sol';
import '../interfaces/IRahatDonor.sol';
import '../interfaces/IRahatTreasury.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';

/// @title Donor contract to create tokens
/// @author Rumsan Associates
/// @notice You can use this contract to manage Rahat tokens and projects
/// @dev All function calls are only executed by contract owner
contract RahatDonor is AbstractTokenActions, ERC165, AccessManaged {
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

  constructor(
    address _admin,
    address _accessManager
  ) AccessManaged(_accessManager) {
    _addOwner(_admin);
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

  function mintToken(address _token, uint256 _amount) public {
    RahatToken(_token).mint(address(this), _amount);
  }

  modifier onlyValidAddress(address _address) {
    require(_address != address(0), 'Invalid address');
    _;
  }

  function mintTokens(
    address _token,
    address _projectAddress,
    uint256 _amount
  ) public returns (bool) {
    RahatToken token = RahatToken(_token);
    token.mint(_projectAddress, _amount);

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
