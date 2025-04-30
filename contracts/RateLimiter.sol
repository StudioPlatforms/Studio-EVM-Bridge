// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IRateLimiter.sol";

/**
 * @title RateLimiter
 * @dev Contract to limit the rate of token transfers
 */
contract RateLimiter is IRateLimiter {
    // Owner of the contract
    address public owner;

    // Resource ID => Rate Limit
    struct RateLimit {
        uint256 limit;      // Maximum amount allowed in a period
        uint256 period;     // Time period in seconds
        uint256 total;      // Current total amount in the period
        uint256 periodEnd;  // End time of the current period
    }

    // Resource ID => Rate Limit
    mapping(bytes32 => RateLimit) public rateLimits;

    /**
     * @dev Modifier to restrict access to the owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "RateLimiter: caller is not the owner");
        _;
    }

    /**
     * @dev Constructor
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Transfer ownership of the contract
     * @param newOwner The address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "RateLimiter: new owner is the zero address");
        owner = newOwner;
    }

    /**
     * @dev Update the rate limit for a resource
     * @param resourceID The resource ID
     * @param amount The amount to update (positive for inbound, negative for outbound)
     * @return The new total amount
     */
    function update(bytes32 resourceID, int256 amount) external override returns (uint256) {
        RateLimit storage rateLimit = rateLimits[resourceID];
        
        // If no rate limit is set, allow any amount
        if (rateLimit.limit == 0) {
            return 0;
        }

        // Reset period if it has ended
        if (block.timestamp > rateLimit.periodEnd) {
            rateLimit.total = 0;
            rateLimit.periodEnd = block.timestamp + rateLimit.period;
        }

        // For outbound transfers (negative amount), check if it exceeds the limit
        if (amount < 0) {
            uint256 absAmount = uint256(-amount);
            require(rateLimit.total + absAmount <= rateLimit.limit, "RateLimiter: rate limit exceeded");
            rateLimit.total += absAmount;
        } else {
            // For inbound transfers (positive amount), reduce the total
            uint256 absAmount = uint256(amount);
            if (absAmount > rateLimit.total) {
                rateLimit.total = 0;
            } else {
                rateLimit.total -= absAmount;
            }
        }

        emit RateLimitUpdated(resourceID, amount, rateLimit.total);
        return rateLimit.total;
    }

    /**
     * @dev Set the rate limit for a resource
     * @param resourceID The resource ID
     * @param limit The rate limit
     * @param period The time period for the limit (in seconds)
     */
    function setLimit(bytes32 resourceID, uint256 limit, uint256 period) external override onlyOwner {
        require(period > 0, "RateLimiter: period must be greater than 0");
        
        RateLimit storage rateLimit = rateLimits[resourceID];
        rateLimit.limit = limit;
        rateLimit.period = period;
        
        // Reset the period
        rateLimit.total = 0;
        rateLimit.periodEnd = block.timestamp + period;

        emit RateLimitSet(resourceID, limit, period);
    }

    /**
     * @dev Get the current rate limit for a resource
     * @param resourceID The resource ID
     * @return limit The rate limit
     * @return period The time period for the limit
     * @return currentTotal The current total amount
     * @return periodEnd The end time of the current period
     */
    function getLimit(bytes32 resourceID) external view override returns (
        uint256 limit,
        uint256 period,
        uint256 currentTotal,
        uint256 periodEnd
    ) {
        RateLimit storage rateLimit = rateLimits[resourceID];
        
        // If the period has ended, the current total would be 0
        uint256 total = rateLimit.total;
        if (block.timestamp > rateLimit.periodEnd && rateLimit.periodEnd > 0) {
            total = 0;
        }
        
        return (
            rateLimit.limit,
            rateLimit.period,
            total,
            rateLimit.periodEnd
        );
    }
}
