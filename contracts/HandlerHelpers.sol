// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IBridge.sol";
import "./security/Ownable.sol";

/**
 * @title HandlerHelpers
 * @dev Contract with helper functions for handlers
 */
contract HandlerHelpers {
    // Bridge contract address
    address public _bridgeAddress;

    // resourceID => token contract address
    mapping(bytes32 => address) public _resourceIDToTokenContractAddress;

    // token contract address => is whitelisted
    mapping(address => bool) public _contractWhitelist;

    // Owner address
    address public _owner;

    /**
     * @dev Modifier to restrict access to the bridge contract
     */
    modifier onlyBridge() {
        require(msg.sender == _bridgeAddress, "HandlerHelpers: caller is not the bridge");
        _;
    }

    /**
     * @dev Modifier to restrict access to the bridge admin
     */
    modifier onlyBridgeAdmin() {
        IBridge bridge = IBridge(_bridgeAddress);
        Ownable ownableBridge = Ownable(_bridgeAddress);
        require(bridge.isRelayer(msg.sender) || msg.sender == ownableBridge.owner(), "HandlerHelpers: caller is not a bridge admin");
        _;
    }

    /**
     * @dev Modifier to restrict access to the owner
     */
    modifier onlyOwner() {
        require(msg.sender == _owner, "HandlerHelpers: caller is not the owner");
        _;
    }

    /**
     * @dev Constructor
     * @param bridgeAddress Address of the bridge contract
     */
    constructor(address bridgeAddress) {
        _bridgeAddress = bridgeAddress;
        _owner = msg.sender;
    }

    /**
     * @dev Updates the bridge address
     * @param newBridgeAddress New bridge address
     */
    function updateBridgeAddress(address newBridgeAddress) external onlyOwner {
        _bridgeAddress = newBridgeAddress;
    }

    /**
     * @dev Sets a resource ID for a token contract address
     * @param resourceID The resource ID to be set
     * @param contractAddress Address of the token contract
     */
    function setResource(bytes32 resourceID, address contractAddress) external onlyBridgeAdmin {
        _setResource(resourceID, contractAddress);
    }

    /**
     * @dev Internal function to set a resource ID for a token contract address
     * @param resourceID The resource ID to be set
     * @param contractAddress Address of the token contract
     */
    function _setResource(bytes32 resourceID, address contractAddress) internal {
        _resourceIDToTokenContractAddress[resourceID] = contractAddress;
        _contractWhitelist[contractAddress] = true;
    }

    /**
     * @dev Sets whether a token contract is whitelisted
     * @param contractAddress Address of the token contract
     * @param whitelisted Whether the contract should be whitelisted
     */
    function setWhitelistStatus(address contractAddress, bool whitelisted) external onlyBridgeAdmin {
        _contractWhitelist[contractAddress] = whitelisted;
    }
}
