// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

/**
 * @title IRateLimiter
 * @dev Interface for the rate limiter contract
 */
interface IRateLimiter {
    /**
     * @dev Emitted when a rate limit is set
     * @param resourceID The resource ID
     * @param limit The rate limit
     * @param period The time period for the limit
     */
    event RateLimitSet(bytes32 indexed resourceID, uint256 limit, uint256 period);

    /**
     * @dev Emitted when a rate limit is updated
     * @param resourceID The resource ID
     * @param amount The amount updated
     * @param newTotal The new total amount
     */
    event RateLimitUpdated(bytes32 indexed resourceID, int256 amount, uint256 newTotal);

    /**
     * @dev Update the rate limit for a resource
     * @param resourceID The resource ID
     * @param amount The amount to update (positive for inbound, negative for outbound)
     * @return The new total amount
     */
    function update(bytes32 resourceID, int256 amount) external returns (uint256);

    /**
     * @dev Set the rate limit for a resource
     * @param resourceID The resource ID
     * @param limit The rate limit
     * @param period The time period for the limit (in seconds)
     */
    function setLimit(bytes32 resourceID, uint256 limit, uint256 period) external;

    /**
     * @dev Get the current rate limit for a resource
     * @param resourceID The resource ID
     * @return limit The rate limit
     * @return period The time period for the limit
     * @return currentTotal The current total amount
     * @return periodEnd The end time of the current period
     */
    function getLimit(bytes32 resourceID) external view returns (
        uint256 limit,
        uint256 period,
        uint256 currentTotal,
        uint256 periodEnd
    );
}
