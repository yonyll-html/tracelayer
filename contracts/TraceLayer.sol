// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TraceLayer
/// @notice Educational supply-chain traceability demo.
contract TraceLayer {
    address public owner;

    struct Batch {
        string productName;
        string origin;
        string currentLocation;
        string status;
        uint256 createdAt;
        bool exists;
    }

    struct Transfer {
        string fromLocation;
        string toLocation;
        string status;
        uint256 timestamp;
        address recordedBy;
    }

    mapping(string => Batch) private batches;
    mapping(string => Transfer[]) private transferHistory;
    mapping(address => bool) public authorizedRecorders;

    event BatchRegistered(
        string indexed batchId,
        string productName,
        string origin,
        address indexed registeredBy
    );

    event TransferRecorded(
        string indexed batchId,
        string fromLocation,
        string toLocation,
        string status,
        uint256 timestamp,
        address indexed recordedBy
    );

    event RecorderAuthorizationChanged(
        address indexed recorder,
        bool authorized
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedRecorders[msg.sender], "Not an authorized recorder");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedRecorders[msg.sender] = true;
    }

    function setRecorderAuthorization(
        address recorder,
        bool authorized
    ) external onlyOwner {
        require(recorder != address(0), "Invalid recorder address");

        authorizedRecorders[recorder] = authorized;

        emit RecorderAuthorizationChanged(recorder, authorized);
    }

    function registerBatch(
        string calldata batchId,
        string calldata productName,
        string calldata origin
    ) external onlyAuthorized {
        require(bytes(batchId).length > 0, "Batch ID required");
        require(bytes(productName).length > 0, "Product name required");
        require(bytes(origin).length > 0, "Origin required");
        require(!batches[batchId].exists, "Batch already exists");

        batches[batchId] = Batch({
            productName: productName,
            origin: origin,
            currentLocation: origin,
            status: "Registered",
            createdAt: block.timestamp,
            exists: true
        });

        emit BatchRegistered(
            batchId,
            productName,
            origin,
            msg.sender
        );
    }

    function recordTransfer(
        string calldata batchId,
        string calldata toLocation,
        string calldata status
    ) external onlyAuthorized {
        require(batches[batchId].exists, "Batch does not exist");
        require(bytes(toLocation).length > 0, "Destination required");
        require(bytes(status).length > 0, "Status required");

        Batch storage batch = batches[batchId];
        string memory fromLocation = batch.currentLocation;

        transferHistory[batchId].push(
            Transfer({
                fromLocation: fromLocation,
                toLocation: toLocation,
                status: status,
                timestamp: block.timestamp,
                recordedBy: msg.sender
            })
        );

        batch.currentLocation = toLocation;
        batch.status = status;

        emit TransferRecorded(
            batchId,
            fromLocation,
            toLocation,
            status,
            block.timestamp,
            msg.sender
        );
    }

    function getBatch(
        string calldata batchId
    ) external view returns (Batch memory) {
        require(batches[batchId].exists, "Batch does not exist");
        return batches[batchId];
    }

    function getTransferCount(
        string calldata batchId
    ) external view returns (uint256) {
        require(batches[batchId].exists, "Batch does not exist");
        return transferHistory[batchId].length;
    }

    function getTransferAt(
        string calldata batchId,
        uint256 index
    ) external view returns (Transfer memory) {
        require(batches[batchId].exists, "Batch does not exist");
        require(
            index < transferHistory[batchId].length,
            "Transfer index out of bounds"
        );

        return transferHistory[batchId][index];
    }

    function getTransferHistory(
        string calldata batchId
    ) external view returns (Transfer[] memory) {
        require(batches[batchId].exists, "Batch does not exist");
        return transferHistory[batchId];
    }
}
