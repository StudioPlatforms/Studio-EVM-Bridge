// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IHandler.sol";
import "./interfaces/IRateLimiter.sol";
import "./HandlerHelpers.sol";

/**
 * @title NativeHandler
 * @dev Handles native token deposits and proposal executions
 */
contract NativeHandler is IHandler, HandlerHelpers {
    // fee percentage, 100 = 1%
    uint256 public _feePercentage;
    
    // destinationDomainID => fee multiplier. 1_000 = 1x, defaults to 1x
    mapping(uint256 => uint256) public chainFeeMultipliers;
    
    // resourceID => fee multiplier. 1_000 = 1x, defaults to 1x
    mapping(bytes32 => uint256) public resourceFeeMultipliers;
    
    // destinationDomainID => resourceID => fee multiplier. 1_000 = 1x, defaults to 1x
    mapping(uint256 => mapping(bytes32 => uint256)) public individualFeeMultipliers;

    // resourceID => chainID => decimals
    mapping(bytes32 => mapping(uint256 => uint8)) public tokenDecimals;

    // This chain's ID
    uint256 public thisChainID;

    // optional rate limiter contract, if zero address, no rate limits apply
    IRateLimiter public rateLimiter;

    // this address will be interpreted as the native coin, e.g. ETH
    // as address(0) is the default value, it can be dangerous to use address(0) as native address
    address private constant NATIVE_ADDRESS = address(1);

    /**
     * @dev Constructor
     * @param bridgeAddress Address of the bridge contract
     * @param feePercentage Fee percentage for token transfers
     */
    constructor(address bridgeAddress, uint256 feePercentage) HandlerHelpers(bridgeAddress) {
        _setFeePercentage(feePercentage);
        
        // Set the native token resource
        _setResource(0x0000000000000000000000000000000000000000000000000000000000000000, NATIVE_ADDRESS);
    }

    /**
     * @dev Set this chain's ID
     * @param chainID This chain's ID
     */
    function setThisChainID(uint256 chainID) external onlyBridgeAdmin {
        thisChainID = chainID;
    }

    /**
     * @dev Set the decimals for a token on a specific chain
     * @param resourceID Resource ID for the token
     * @param chainID Chain ID where the token exists
     * @param decimals Number of decimals for the token
     */
    function setTokenDecimals(bytes32 resourceID, uint256 chainID, uint8 decimals) external onlyBridgeAdmin {
        tokenDecimals[resourceID][chainID] = decimals;
    }

    /**
     * @dev Get the decimals for a token on a specific chain
     * @param resourceID Resource ID for the token
     * @param chainID Chain ID where the token exists
     * @return decimals Number of decimals for the token
     */
    function getTokenDecimals(bytes32 resourceID, uint256 chainID) external view returns (uint8) {
        return tokenDecimals[resourceID][chainID];
    }

    /**
     * @dev Process a deposit
     * @param resourceID Resource ID for the token
     * @param depositer Address of the depositer
     * @param destinationChainID Chain ID of the destination chain
     * @param data Additional data for the deposit
     * @return bytes The encoded amount after fees, depositer address, and recipient address
     */
    function deposit(
        bytes32 resourceID,
        address depositer,
        uint256 destinationChainID,
        bytes calldata data
    ) external payable override onlyBridge returns (bytes memory) {
        // Decode amount and recipient from data (consistent with Bridge and ERC20Handler)
        // We ignore the amount since we use msg.value for native tokens
        (, address recipient) = abi.decode(data, (uint256, address));
        
        // If recipient is not specified, use the depositer
        if (recipient == address(0)) {
            recipient = depositer;
        }

        // Use msg.value as the amount
        uint256 amount = msg.value;

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "NativeHandler: invalid resourceID");
        require(tokenAddress == NATIVE_ADDRESS, "NativeHandler: not a native token");

        if (address(rateLimiter) != address(0)) {
            // update rate limiter
            // if rate limit is reached, rate limiter reverts
            rateLimiter.update(resourceID, -int256(amount));
        }

        uint256 fee = _calculateFee(resourceID, destinationChainID, amount);
        uint256 amountAfterFee = amount - fee;
        
        // Transfer fee to bridge contract
        if (fee > 0) {
            payable(_bridgeAddress).transfer(fee);
        }

        // The deposited tokens simply remain in this contract

        // Include the depositer and recipient addresses in the returned data
        return abi.encode(amountAfterFee, depositer, recipient);
    }

    /**
     * @dev Execute a proposal
     * @param resourceID Resource ID for the token
     * @param data Additional data for the proposal
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge {
        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "NativeHandler: invalid resourceID");
        require(tokenAddress == NATIVE_ADDRESS, "NativeHandler: not a native token");

        // Decode data (amount, depositer, recipient)
        (uint256 amount, address depositer, address recipient) = abi.decode(data, (uint256, address, address));

        if (address(rateLimiter) != address(0)) {
            // update rate limiter
            // if rate limit is reached, rate limiter reverts
            rateLimiter.update(resourceID, int256(amount));
        }

        // Get the source chain ID from the Bridge contract
        uint256 sourceChainID = IBridge(_bridgeAddress).getProposalSourceChainID(resourceID, amount, depositer, recipient);

        // Get the decimals for the source and destination chains
        uint8 sourceDecimals = tokenDecimals[resourceID][sourceChainID];
        uint8 destinationDecimals = tokenDecimals[resourceID][thisChainID];

        // If decimals are not set, default to 18 (most native tokens have 18 decimals)
        if (destinationDecimals == 0) {
            destinationDecimals = 18;
            tokenDecimals[resourceID][thisChainID] = 18;
        }

        // If source decimals are not set, default to 18
        if (sourceDecimals == 0) {
            sourceDecimals = 18;
        }

        // Convert amount based on decimal difference
        uint256 convertedAmount = amount;
        if (sourceDecimals > destinationDecimals) {
            // Divide by 10^(sourceDecimals - destinationDecimals)
            convertedAmount = amount / (10 ** (sourceDecimals - destinationDecimals));
        } else if (sourceDecimals < destinationDecimals) {
            // Multiply by 10^(destinationDecimals - sourceDecimals)
            convertedAmount = amount * (10 ** (destinationDecimals - sourceDecimals));
        }

        // Ensure the converted amount is greater than zero
        require(convertedAmount > 0, "NativeHandler: converted amount is zero");

        // Transfer native tokens to the recipient
        payable(recipient).transfer(convertedAmount);
    }

    /**
     * @dev Calculate the fee for a deposit
     * @param resourceID Resource ID for the token
     * @param destinationChainID Chain ID of the destination chain
     * @param data Additional data for the deposit
     * @return feeToken Address of the token used for the fee
     * @return fee Amount of the fee
     */
    function calculateFee(
        bytes32 resourceID,
        address /* depositer */,
        uint256 destinationChainID,
        bytes calldata data
    ) external view override returns (address feeToken, uint256 fee) {
        // For native tokens, we use msg.value as the amount
        // This function is only used for estimation, so we'll return a fee based on the amount in data
        // The actual fee will be calculated in the deposit function using msg.value
        
        // For consistency with Bridge and ERC20Handler, decode data as (uint256, address)
        (uint256 amount, ) = abi.decode(data, (uint256, address));

        feeToken = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[feeToken], "NativeHandler: invalid resourceID");
        require(feeToken == NATIVE_ADDRESS, "NativeHandler: not a native token");

        fee = _calculateFee(resourceID, destinationChainID, amount);
    }

    /**
     * @dev Update the rate limiter
     * @param _rateLimiter Address of the rate limiter contract
     */
    function updateRateLimiter(address _rateLimiter) external onlyBridgeAdmin {
        rateLimiter = IRateLimiter(_rateLimiter);
    }

    /**
     * @dev Set the fee percentage
     * @param feePercentage The fee percentage
     */
    function setFeePercentage(uint256 feePercentage) external override onlyBridgeAdmin {
        _setFeePercentage(feePercentage);
    }

    /**
     * @dev Set the chain fee multiplier
     * @param domainId The ID of the chain
     * @param feeMultiplier The fee multiplier
     */
    function setFeeMultiplierChain(uint256 domainId, uint256 feeMultiplier) external override onlyBridgeAdmin {
        chainFeeMultipliers[domainId] = feeMultiplier;
    }

    /**
     * @dev Set the resource fee multiplier
     * @param resourceId The resource ID
     * @param feeMultiplier The fee multiplier
     */
    function setFeeMultiplierResource(bytes32 resourceId, uint256 feeMultiplier) external override onlyBridgeAdmin {
        resourceFeeMultipliers[resourceId] = feeMultiplier;
    }

    /**
     * @dev Set the individual fee multiplier
     * @param domainId The ID of the chain
     * @param resourceId The resource ID
     * @param feeMultiplier The fee multiplier
     */
    function setFeeMultiplierIndividual(
        uint256 domainId,
        bytes32 resourceId,
        uint256 feeMultiplier
    ) external override onlyBridgeAdmin {
        individualFeeMultipliers[domainId][resourceId] = feeMultiplier;
    }

    /**
     * @dev Withdraw native tokens from the handler
     * @param recipient Address to receive the tokens
     * @param amount Amount of tokens to withdraw
     */
    function withdrawNative(
        address payable recipient,
        uint256 amount
    ) external onlyBridgeAdmin {
        require(address(this).balance >= amount, "NativeHandler: insufficient balance");
        recipient.transfer(amount);
    }

    /**
     * @dev Internal function to set the fee percentage
     * @param feePercentage The fee percentage
     */
    function _setFeePercentage(uint256 feePercentage) internal {
        require(feePercentage <= 10000, "NativeHandler: invalid fee");
        _feePercentage = feePercentage;
    }

    /**
     * @dev Internal function to calculate the fee
     * @param resourceId The resource ID
     * @param destinationChainID The ID of the destination chain
     * @param tokenAmount The amount of tokens
     * @return fee The fee amount
     */
    function _calculateFee(
        bytes32 resourceId,
        uint256 destinationChainID,
        uint256 tokenAmount
    ) internal view returns (uint256 fee) {
        fee = (tokenAmount * _feePercentage) / 10_000;

        if (individualFeeMultipliers[destinationChainID][resourceId] != 0) {
            // fee for individual chain token combination
            fee = (fee * individualFeeMultipliers[destinationChainID][resourceId]) / 1_000;
        } else {
            if (chainFeeMultipliers[destinationChainID] != 0) {
                // chain fee multiplier
                fee = (fee * chainFeeMultipliers[destinationChainID]) / 1_000;
            }
            if (resourceFeeMultipliers[resourceId] != 0) {
                // token fee multiplier
                fee = (fee * resourceFeeMultipliers[resourceId]) / 1_000;
            }
        }
    }

    /**
     * @dev Receive function to accept native tokens
     */
    receive() external payable {
        // Accept native tokens
    }

    /**
     * @dev Fallback function to accept native tokens
     */
    fallback() external payable {
        // Accept native tokens
    }
}
