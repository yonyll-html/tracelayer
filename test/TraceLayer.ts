
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("TraceLayer", function () {
  async function deployTraceLayer() {
    const traceLayer = await ethers.deployContract("TraceLayer");
    const [owner, recorder, stranger, warehouseB, warehouseC] =
      await ethers.getSigners();

    return {
      traceLayer,
      owner,
      recorder,
      stranger,
      warehouseB,
      warehouseC
    };
  }

  async function registerCoffeeBatch(traceLayer: any, batchId: string) {
    await traceLayer.registerBatch(
      batchId,
      "Coffee Beans",
      "Farm A",
      "farm-a"
    );
  }

  async function transferBatch(
    traceLayer: any,
    batchId: string,
    operatorId: string,
    currentCustodian: string,
    destination: string,
    status: string,
    newCustodian: string,
    nonce: bigint
  ) {
    return traceLayer.recordTransfer(
      batchId,
      operatorId,
      currentCustodian,
      destination,
      status,
      newCustodian,
      nonce
    );
  }

  it("registers a batch and stores its details", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch(
        "COFFEE-001",
        "Coffee Beans",
        "Farm A",
        "farm-a"
      )
    )
      .to.emit(traceLayer, "BatchRegistered")
      .withArgs(
        "COFFEE-001",
        "Coffee Beans",
        "Farm A",
        "farm-a"
      );

    const batch = await traceLayer.getBatch("COFFEE-001");

    expect(batch.productName).to.equal("Coffee Beans");
    expect(batch.origin).to.equal("Farm A");
    expect(batch.currentLocation).to.equal("Farm A");
    expect(batch.status).to.equal("Registered");
    expect(batch.currentCustodian).to.equal("farm-a");
    expect(batch.exists).to.equal(true);
  });

  it("records transfers and preserves the full history", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-002");

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-002",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "In transit",
        "warehouse-b",
        0n
      )
    ).to.emit(traceLayer, "TransferRecorded");

    await transferBatch(
      traceLayer,
      "COFFEE-002",
      "operator-2",
      "warehouse-b",
      "Port C",
      "Exported",
      "port-c",
      1n
    );

    const batch = await traceLayer.getBatch("COFFEE-002");
    const history = await traceLayer.getTransferHistory("COFFEE-002");

    expect(batch.currentLocation).to.equal("Port C");
    expect(batch.status).to.equal("Exported");
    expect(batch.currentCustodian).to.equal("port-c");

    expect(await traceLayer.getTransferCount("COFFEE-002")).to.equal(2n);

    expect(history[0].fromLocation).to.equal("Farm A");
    expect(history[0].toLocation).to.equal("Warehouse B");
    expect(history[0].status).to.equal("In transit");
    expect(history[0].operatorId).to.equal("operator-1");
    expect(history[0].fromCustodian).to.equal("farm-a");
    expect(history[0].toCustodian).to.equal("warehouse-b");

    expect(history[1].fromLocation).to.equal("Warehouse B");
    expect(history[1].toLocation).to.equal("Port C");
    expect(history[1].status).to.equal("Exported");
    expect(history[1].operatorId).to.equal("operator-2");
    expect(history[1].fromCustodian).to.equal("warehouse-b");
    expect(history[1].toCustodian).to.equal("port-c");

    expect(await traceLayer.transferNonces("COFFEE-002")).to.equal(2n);
  });

  it("allows only the authorized relayer to register batches", async function () {
    const { traceLayer, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).registerBatch(
        "BATCH-001",
        "Cocoa",
        "Farm B",
        "farm-b"
      )
    ).to.be.revertedWith("Only authorized relayer");
  });

  it("allows only the authorized relayer to record transfers", async function () {
    const { traceLayer, stranger } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-003");

    await expect(
      traceLayer.connect(stranger).recordTransfer(
        "COFFEE-003",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "In transit",
        "warehouse-b",
        0n
      )
    ).to.be.revertedWith("Only authorized relayer");
  });

  it("rejects transfers when the supplied organization is not the current custodian", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-004");

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-004",
        "operator-1",
        "warehouse-b",
        "Warehouse C",
        "In transit",
        "warehouse-c",
        0n
      )
    ).to.be.revertedWith("Not the current custodian");
  });

  it("prevents a former custodian from initiating another handoff", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-005");

    await transferBatch(
      traceLayer,
      "COFFEE-005",
      "operator-1",
      "farm-a",
      "Warehouse B",
      "In transit",
      "warehouse-b",
      0n
    );

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-005",
        "operator-2",
        "farm-a",
        "Port C",
        "Exported",
        "port-c",
        1n
      )
    ).to.be.revertedWith("Not the current custodian");
  });

  it("rejects transfers with an outdated nonce", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-006");

    await transferBatch(
      traceLayer,
      "COFFEE-006",
      "operator-1",
      "farm-a",
      "Warehouse B",
      "In transit",
      "warehouse-b",
      0n
    );

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-006",
        "operator-2",
        "warehouse-b",
        "Port C",
        "Exported",
        "port-c",
        0n
      )
    ).to.be.revertedWith("Invalid transfer nonce");
  });

  it("increments the nonce after each successful transfer", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-007");

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(0n);

    await transferBatch(
      traceLayer,
      "COFFEE-007",
      "operator-1",
      "farm-a",
      "Warehouse B",
      "In transit",
      "warehouse-b",
      0n
    );

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(1n);

    await transferBatch(
      traceLayer,
      "COFFEE-007",
      "operator-2",
      "warehouse-b",
      "Port C",
      "Exported",
      "port-c",
      1n
    );

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(2n);
  });

  it("rejects duplicate batch IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "BATCH-002");

    await expect(
      traceLayer.registerBatch(
        "BATCH-002",
        "Coffee",
        "Farm B",
        "farm-b"
      )
    ).to.be.revertedWith("Batch already exists");
  });

  it("rejects transfers for nonexistent batches", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      transferBatch(
        traceLayer,
        "UNKNOWN",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "Received",
        "warehouse-b",
        0n
      )
    ).to.be.revertedWith("Batch does not exist");
  });

  it("allows the owner to change the relayer", async function () {
    const { traceLayer, recorder, owner } = await deployTraceLayer();

    await expect(traceLayer.setRelayer(recorder.address))
      .to.emit(traceLayer, "RelayerChanged")
      .withArgs(owner.address, recorder.address);

    expect(await traceLayer.relayer()).to.equal(recorder.address);

    await expect(
      traceLayer.registerBatch(
        "BATCH-003",
        "Cocoa",
        "Farm C",
        "farm-c"
      )
    ).to.be.revertedWith("Only authorized relayer");

    await traceLayer.connect(recorder).registerBatch(
      "BATCH-003",
      "Cocoa",
      "Farm C",
      "farm-c"
    );

    expect(
      (await traceLayer.getBatch("BATCH-003")).productName
    ).to.equal("Cocoa");
  });

  it("prevents non-owners from changing the relayer", async function () {
    const { traceLayer, recorder, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).setRelayer(recorder.address)
    ).to.be.revertedWith("Only owner");
  });

  it("rejects a zero address as the new relayer", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.setRelayer(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid relayer address");
  });

  it("rejects transferring custody to the current custodian", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-001");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-001",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "In transit",
        "farm-a",
        0n
      )
    ).to.be.revertedWith("Already the current custodian");
  });

  it("rejects empty batch IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("", "Coffee", "Farm A", "farm-a")
    ).to.be.revertedWith("Batch ID required");
  });

  it("rejects empty product names", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-002", "", "Farm A", "farm-a")
    ).to.be.revertedWith("Product name required");
  });

  it("rejects empty origins", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-003", "Coffee", "", "farm-a")
    ).to.be.revertedWith("Origin required");
  });

  it("rejects empty initial custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-004", "Coffee", "Farm A", "")
    ).to.be.revertedWith("Custodian ID required");
  });

  it("rejects empty operator IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-005");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-005",
        "",
        "farm-a",
        "Warehouse B",
        "In transit",
        "warehouse-b",
        0n
      )
    ).to.be.revertedWith("Operator ID required");
  });

  it("rejects empty transfer destinations", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-006");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-006",
        "operator-1",
        "farm-a",
        "",
        "In transit",
        "warehouse-b",
        0n
      )
    ).to.be.revertedWith("Destination required");
  });

  it("rejects empty transfer statuses", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-007");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-007",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "",
        "warehouse-b",
        0n
      )
    ).to.be.revertedWith("Status required");
  });

  it("rejects empty new custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-008");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-008",
        "operator-1",
        "farm-a",
        "Warehouse B",
        "In transit",
        "",
        0n
      )
    ).to.be.revertedWith("New custodian required");
  });
});
