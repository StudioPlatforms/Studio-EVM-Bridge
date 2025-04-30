// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IHandler.sol";
import "./interfaces/IRateLimiter.sol";
import "./interfaces/IERC20.sol";
import "./HandlerHelpers.sol";

/**
 * @title ERC20HandlerFixed
 * @dev Handles ERC20 deposits and proposal executions with support for non-standard ERC20 tokens like USDT
 */
contract ERC20HandlerFixed is IHandler, HandlerHelpers {
    // token contract address => is burnable
    mapping(address => bool) public _burnList;

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

    /**
     * @dev Constructor
     * @param bridgeAddress Address of the bridge contract
     * @param feePercentage Fee percentage for token transfers
     */
    constructor(address bridgeAddress, uint256 feePercentage) HandlerHelpers(bridgeAddress) {
        _setFeePercentage(feePercentage);
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
     * @dev Auto-detect and set the decimals for a token on this chain
     * @param resourceID Resource ID for the token
     */
    function autoDetectDecimals(bytes32 resourceID) external onlyBridgeAdmin {
        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "ERC20Handler: invalid resourceID");
        
        try IERC20(tokenAddress).decimals() returns (uint8 decimals) {
            tokenDecimals[resourceID][thisChainID] = decimals;
        } catch {
            // If the token doesn't have a decimals function, default to 18
            tokenDecimals[resourceID][thisChainID] = 18;
        }
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
        // Decode amount and recipient from data
        (uint256 amount, address recipient) = abi.decode(data, (uint256, address));
        
        // If recipient is not specified, use the depositer
        if (recipient == address(0)) {
            recipient = depositer;
        }

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "ERC20Handler: invalid resourceID");

        if (address(rateLimiter) != address(0)) {
            // update rate limiter
            // if rate limit is reached, rate limiter reverts
            rateLimiter.update(resourceID, -int256(amount));
        }

        // Process the deposit based on whether the token is burnable or not
        return _processDeposit(resourceID, depositer, recipient, destinationChainID, amount, tokenAddress);
    }

    /**
     * @dev Internal function to process a deposit
     */
    function _processDeposit(
        bytes32 resourceID,
        address depositer,
        address recipient,
        uint256 destinationChainID,
        uint256 amount,
        address tokenAddress
    ) internal returns (bytes memory) {
        if (_burnList[tokenAddress]) {
            // For burnable tokens, we burn the tokens directly
            _safeTransferFrom(tokenAddress, depositer, address(0), amount);
            
            // Calculate fee based on the amount
            uint256 fee = _calculateFee(resourceID, destinationChainID, amount);
            uint256 amountAfterFee = amount - fee;
            
            // Return the amount after fees, depositer, and recipient
            return abi.encode(amountAfterFee, depositer, recipient);
        } else {
            // For non-burnable tokens, we need to handle fee-on-transfer tokens
            
            // First, transfer the full amount to the handler
            IERC20 token = IERC20(tokenAddress);
            uint256 balanceBefore = token.balanceOf(address(this));
            
            // Use safe transfer from to handle non-standard ERC20 tokens like USDT
            _safeTransferFrom(tokenAddress, depositer, address(this), amount);
            
            uint256 actualReceived = token.balanceOf(address(this)) - balanceBefore;
            
            // Calculate fee based on the actual received amount
            uint256 fee = _calculateFee(resourceID, destinationChainID, actualReceived);
            uint256 amountAfterFee = actualReceived - fee;
            
            // Transfer fee to bridge contract from handler's balance
            if (fee > 0) {
                // Use safe transfer to handle non-standard ERC20 tokens like USDT
                _safeTransfer(tokenAddress, _bridgeAddress, fee);
            }
            
            // Return the amount after fees, depositer, and recipient
            return abi.encode(amountAfterFee, depositer, recipient);
        }
    }

    /**
     * @dev Execute a proposal
     * @param resourceID Resource ID for the token
     * @param data Additional data for the proposal
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge {
        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "ERC20Handler: invalid resourceID");

        // Decode data (amount, depositer, recipient)
        (uint256 amount, address depositer, address recipient) = abi.decode(data, (uint256, address, address));

        if (address(rateLimiter) != address(0)) {
            // update rate limiter
            // if rate limit is reached, rate limiter reverts
            rateLimiter.update(resourceID, int256(amount));
        }

        // Get the source chain ID from the Bridge contract
        uint256 sourceChainID = IBridge(_bridgeAddress).getProposalSourceChainID(resourceID, amount, depositer, recipient);

        // Process the proposal execution
        _processProposalExecution(resourceID, tokenAddress, amount, recipient, sourceChainID);
    }

    /**
     * @dev Internal function to process a proposal execution
     */
    function _processProposalExecution(
        bytes32 resourceID,
        address tokenAddress,
        uint256 amount,
        // address depositer, // Unused parameter, commented out to silence warning
        address recipient,
        uint256 sourceChainID
    ) internal {
        // Get the decimals for the source and destination chains
        uint8 sourceDecimals = tokenDecimals[resourceID][sourceChainID];
        uint8 destinationDecimals = tokenDecimals[resourceID][thisChainID];

        // If decimals are not set, try to auto-detect them
        if (destinationDecimals == 0) {
            try IERC20(tokenAddress).decimals() returns (uint8 decimals) {
                destinationDecimals = decimals;
                tokenDecimals[resourceID][thisChainID] = decimals;
            } catch {
                // If the token doesn't have a decimals function, default to 18
                destinationDecimals = 18;
                tokenDecimals[resourceID][thisChainID] = 18;
            }
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
        require(convertedAmount > 0, "ERC20Handler: converted amount is zero");

        if (_burnList[tokenAddress]) {
            mintERC20(tokenAddress, recipient, convertedAmount);
        } else {
            releaseERC20(tokenAddress, recipient, convertedAmount);
        }
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
        (uint256 amount, ) = abi.decode(data, (uint256, address));

        feeToken = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[feeToken], "ERC20Handler: invalid resourceID");

        fee = _calculateFee(resourceID, destinationChainID, amount);
    }

    /**
     * @dev Set whether a token is burnable
     * @param contractAddress Address of the token contract
     * @param burnable Whether the token is burnable
     */
    function setBurnable(address contractAddress, bool burnable) external onlyBridgeAdmin {
        require(_contractWhitelist[contractAddress], "ERC20Handler: not whitelisted");
        _burnList[contractAddress] = burnable;
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
     * @dev Withdraw tokens from the handler
     * @param tokenAddress Address of the token to withdraw
     * @param recipient Address to receive the tokens
     * @param amount Amount of tokens to withdraw
     */
    function withdrawTokens(
        address tokenAddress,
        address recipient,
        uint256 amount
    ) external onlyBridgeAdmin {
        require(_contractWhitelist[tokenAddress], "ERC20Handler: token not whitelisted");
        
        // Use safe transfer to handle non-standard ERC20 tokens like USDT
        _safeTransfer(tokenAddress, recipient, amount);
    }

    /**
     * @dev Internal function to set the fee percentage
     * @param feePercentage The fee percentage
     */
    function _setFeePercentage(uint256 feePercentage) internal {
        require(feePercentage <= 10000, "ERC20Handler: invalid fee");
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
     * @dev Safely transfers ERC20 tokens from one address to another
     * @param token The address of the ERC20 token
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param amount The amount to transfer
     */
    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        require(success, "ERC20Handler: transferFrom call reverted");

        // If it returned any data at all, we expect a single bool.
        if (returnData.length > 0) {
            // Old USDT returns empty data on success, so only decode if there is data
            require(abi.decode(returnData, (bool)), "ERC20Handler: transferFrom returned false");
        }
    }

    /**
     * @dev Safely transfers ERC20 tokens to an address
     * @param token The address of the ERC20 token
     * @param to The address to transfer to
     * @param amount The amount to transfer
     */
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(success, "ERC20Handler: transfer call reverted");

        // If it returned any data at all, we expect a single bool.
        if (returnData.length > 0) {
            // Old USDT returns empty data on success, so only decode if there is data
            require(abi.decode(returnData, (bool)), "ERC20Handler: transfer returned false");
        }
    }

    /**
     * @dev Burns ERC20 tokens
     * @param tokenAddress The address of the ERC20 token
     * @param from The address to burn tokens from
     * @param amount The amount to burn
     */
    function burnERC20(
        address tokenAddress,
        address from,
        uint256 amount
    ) internal {
        // For tokens that support burning, we would call the burn function
        // For simplicity, we'll just transfer to the zero address
        _safeTransferFrom(tokenAddress, from, address(0), amount);
    }

    /**
     * @dev Releases ERC20 tokens from this contract
     * @param tokenAddress The address of the ERC20 token
     * @param to The address to release tokens to
     * @param amount The amount to release
     */
    function releaseERC20(
        address tokenAddress,
        address to,
        uint256 amount
    ) internal {
        _safeTransfer(tokenAddress, to, amount);
    }

    /**
     * @dev Mints ERC20 tokens
     * @param tokenAddress The address of the ERC20 token
     * @param to The address to mint tokens to
     * @param amount The amount to mint
     */
    function mintERC20(
        address tokenAddress,
        address to,
        uint256 amount
    ) internal {
        // For tokens that support minting, we would call the mint function
        // For simplicity, we'll just transfer from this contract
        _safeTransfer(tokenAddress, to, amount);
    }
}
