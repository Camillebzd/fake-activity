// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract GasBurner {
    uint256 public counter;

    function burnGas(uint256 iterations) public {
        uint256 sum = counter;
        for (uint256 i = 0; i < iterations; i++) {
            // reduce gas cost but allow for overflow
            unchecked {
                sum += i;
            }
        }
        counter = sum;
    }
}