import {
  createChannel,
  createClient,
  ChannelCredentials,
  Channel,
} from "nice-grpc";
import { AccountId, LayerNumber } from "./proto/gen/spacemesh/v1/types";
import { mnemonicToSeedSync } from "bip39";
import {
  AccountMeshDataFilter,
  AccountMeshDataFlag,
  AccountMeshDataQueryRequest,
  AccountMeshDataQueryResponse,
} from "./proto/gen/spacemesh/v1/mesh_types";
import {
  MeshServiceClient,
  MeshServiceDefinition,
} from "./proto/gen/spacemesh/v1/mesh";
import fetch from "node-fetch";
import { TextEncoder } from "util";
import crypto from "crypto";
import { loadWasm } from "./wasm_loader";
const { Client, GatewayIntentBits } = require("discord.js");
const nopedb = require("nope.db");

require("dotenv").config();
const db = new nopedb({
  path: "./data/stored_txs.json",
  seperator: ".",
  spaces: 2,
});

// https://discord.com/api/oauth2/authorize?client_id=1009365106666246144&permissions=2048&scope=bot

declare global {
  function crypto(): string;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
let discordChannel: any;

declare var Go: any;

const senderSeed: string = process.env.SEEDPHRASE!;

let url = "https://discover.spacemesh.io/networks.json";
let networkUrl: String;
let channel: Channel;
let initialMsgSend = false;

main();

function main() {
  client.once("ready", async () => {
    console.log("Ready!");
    discordChannel = client.channels.cache.get("1009542139128070254");

    while (1) {
      console.log("gettingNetwork");
      await getNetwork();
      console.log("gettingTxs");
      await getTxs();
      console.log("done. sleep...");
      await sleep(10 * 1000);
    }
  });

  client.login(process.env.TOKEN);
}

async function getNetwork() {
  await fetch(url)
    .then((response) => response.json())
    .then((res) => {
      networkUrl = res[0]["grpcAPI"].slice(0, -1).substring(8);
      channel = createChannel(
        `${networkUrl}:443`,
        ChannelCredentials.createSsl()
      );
    });
}

async function getTxs() {
  const senderPrivateKey = mnemonicToSeedSync(senderSeed);

  const slicedSenderPrivateKey = new Uint8Array(senderPrivateKey.slice(32));

  const enc = new TextEncoder();
  const saltAsUint8Array = enc.encode("Spacemesh blockmesh");
  let publicKey = new Uint8Array(32);
  let secretKey = new Uint8Array(64);

  globalThis.crypto = {
    // @ts-ignore
    getRandomValues(b) {
      crypto.randomFillSync(b);
    },
  };
  require("./wasm_exec");

  await loadWasm("./src/ed25519.wasm")
    .then(() => {
      secretKey =
        // @ts-ignore
        __deriveNewKeyPair(slicedSenderPrivateKey, 0, saltAsUint8Array);
      publicKey = secretKey.slice(32);
    })
    .catch((error) => {
      console.log("ouch", error);
    });

  if (!initialMsgSend) {
    // discordChannel.send(
    //   `🌳 If you want to plant a tree send 1000 SMH to **0x${toHexString(
    //     publicKey.slice(12)
    //   )}** 💸`
    // );
    initialMsgSend = true;
  }

  console.log(`bot public key: 0x${toHexString(publicKey.slice(12))}`);
  console.log(`connecting to ${networkUrl}:443`);

  const client: MeshServiceClient = createClient(
    MeshServiceDefinition,
    channel
  );

  const accountQueryId: AccountId = { address: publicKey };

  const accountMeshQueryFilder: AccountMeshDataFilter = {
    accountId: accountQueryId,
    accountMeshDataFlags:
      AccountMeshDataFlag.ACCOUNT_MESH_DATA_FLAG_TRANSACTIONS,
  };

  const queryLayerNumber: LayerNumber = { number: 0 };

  const accountMeshQuery: AccountMeshDataQueryRequest = {
    filter: accountMeshQueryFilder,
    maxResults: 0,
    offset: 0,
    minLayer: queryLayerNumber,
  };

  let accountQueryResponse: AccountMeshDataQueryResponse =
    await client.accountMeshDataQuery(accountMeshQuery);

  accountQueryResponse.data.map((d) => {
    let sender = toHexString(d.meshTransaction?.transaction?.sender?.address);
    let receiver = toHexString(
      d.meshTransaction?.transaction?.coinTransfer?.receiver?.address
    );
    let amount = JSON.stringify(d.meshTransaction?.transaction?.amount?.value);

    if (
      !db.has(toHexString(d.meshTransaction?.transaction?.id?.id)) &&
      parseInt(amount) >= 1000000000000000 &&
      receiver == toHexString(publicKey.slice(12))
    ) {
      db.push(toHexString(d.meshTransaction?.transaction?.id?.id), {
        sender: sender,
        receiver: receiver,
        amount: amount,
      });
      discordChannel.send(
        `🌳 \`0x${sender}\` **sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!** ❤️ \nIf you also want to plant a tree send 1000 SMH to **0x${toHexString(
          publicKey.slice(12)
        )}** 💸`
      );
      console.log(
        `0x${sender} sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!`
      );
    } else console.log("nothing new");
  });
}

const toHexString = (bytes: Uint8Array | Buffer | any): string =>
  bytes instanceof Buffer
    ? bytes.toString("hex")
    : bytes.reduce(
        (str: string, byte: number) => str + byte.toString(16).padStart(2, "0"),
        ""
      );

function sleep(ms: number | undefined) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
