// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

/**
 * @title IHandler
 * @dev Interface for handler contracts that process deposits and proposals
 */
interface IHandler {
    /**
     * @dev Process a deposit
     * @param resourceID Resource ID for the token
     * @param depositer Address of the depositer
     * @param destinationChainID Chain ID of the destination chain
     * @param data Additional data for the deposit (encoded amount and recipient)
     * @return bytes The encoded amount after fees, depositer address, and recipient address
     */
    function deposit(
        bytes32 resourceID,
        address depositer,
        uint256 destinationChainID,
        bytes calldata data
    ) external payable returns (bytes memory);

    /**
     * @dev Execute a proposal
     * @param resourceID Resource ID for the token
     * @param data Additional data for the proposal (encoded amount, depositer, and recipient)
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external;

    /**
     * @dev Calculate the fee for a deposit
     * @param resourceID Resource ID for the token
     * @param depositer Address of the depositer
     * @param destinationChainID Chain ID of the destination chain
     * @param data Additional data for the deposit (encoded amount and recipient)
     * @return feeToken Address of the token used for the fee
     * @return fee Amount of the fee
     */
    function calculateFee(
        bytes32 resourceID,
        address depositer,
        uint256 destinationChainID,
        bytes calldata data
    ) external view returns (address feeToken, uint256 fee);

    /**
     * @dev Set the fee percentage
     * @param feePercentage The fee percentage
     */
    function setFeePercentage(uint256 feePercentage) external;

    /**
     * @dev Set the chain fee multiplier
     * @param domainId The ID of the chain
     * @param feeMultiplier The fee multiplier
     */
    function setFeeMultiplierChain(uint256 domainId, uint256 feeMultiplier) external;

    /**
     * @dev Set the resource fee multiplier
     * @param resourceId The resource ID
     * @param feeMultiplier The fee multiplier
     */
    function setFeeMultiplierResource(bytes32 resourceId, uint256 feeMultiplier) external;

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
    ) external;
}
