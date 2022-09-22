import fetch from "node-fetch";
import {
  AccountId,
  AccountMeshDataFilter,
  AccountMeshDataFlag,
  AccountMeshDataQueryRequest,
  AccountMeshDataQueryResponse,
  createClients,
  createGlobalStateClient,
  createMeshClient,
  createTransactionClient,
  derivePublicKey,
  getAccountBalance,
  GlobalStateServiceClient,
  LayerNumber,
  MeshServiceClient,
  TransactionServiceClient,
} from "@andreivcodes/spacemeshlib";
import { Channel, Client, GatewayIntentBits } from "discord.js";
import { JsonDB, Config } from "node-json-db";
import { config } from "dotenv";

config();

var db = new JsonDB(new Config("./data/stored_txs", true, false, "/"));

// https://discord.com/api/oauth2/authorize?client_id=1009365106666246144&permissions=2048&scope=bot

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
let discordChannel: any;

const SEED: string = process.env.SEEDPHRASE!;
let spacemeshNetworkClient: MeshServiceClient<{}>;

let url = "https://discover.spacemesh.io/networks.json";
let networkUrl: string;
let initialMsgSend = false;

const main = async () => {
  await db.push("/timestamp", new Date());

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
};

const getNetwork = async () => {
  await fetch(url)
    .then((response) => response.json())
    .then((res: any) => {
      networkUrl = res[0]["grpcAPI"].slice(0, -1).substring(8);

      spacemeshNetworkClient = createMeshClient(networkUrl, 443, true);
    });
};

const getTxs = async () => {
  const pk = (await derivePublicKey(SEED, 0)) as Uint8Array;

  if (!initialMsgSend) {
    // discordChannel.send(
    //   `🌳 If you want to plant a tree send 1000 SMH to **0x${toHexString(
    //     publicKey.slice(12)
    //   )}** 💸`
    // );
    initialMsgSend = true;
  }

  console.log(`bot public key: 0x${toHexString(pk.slice(12))}`);
  console.log(`connecting to ${networkUrl}:443`);

  const accountQueryId: AccountId = { address: pk.slice(12) };

  const accountMeshQueryFilder: AccountMeshDataFilter = {
    accountId: accountQueryId,
    accountMeshDataFlags:
      AccountMeshDataFlag.ACCOUNT_MESH_DATA_FLAG_TRANSACTIONS,
  };

  const queryLayerNumber: LayerNumber = { number: 0 };

  const accountMeshQuery: AccountMeshDataQueryRequest = {
    filter: accountMeshQueryFilder,
    maxResults: 100,
    offset: 0,
    minLayer: queryLayerNumber,
  };

  let accountQueryResponse: AccountMeshDataQueryResponse =
    await spacemeshNetworkClient.accountMeshDataQuery(accountMeshQuery);

  accountQueryResponse.data.map(async (d) => {
    let sender = toHexString(d.meshTransaction?.transaction?.sender?.address);
    let receiver = toHexString(
      d.meshTransaction?.transaction?.coinTransfer?.receiver?.address
    );
    let amount = JSON.stringify(d.meshTransaction?.transaction?.amount?.value);

    amount = amount.substring(1, amount.length - 1);

    let alreadyStored = true;

    await db
      .getData("/" + toHexString(d.meshTransaction?.transaction?.id?.id))
      .catch((e) => {
        console.log("does not exist");
        alreadyStored = false;
      });

    if (
      !alreadyStored &&
      BigInt(amount) >= BigInt(1000000000000000) &&
      receiver == toHexString(pk.slice(12))
    ) {
      db.push("/" + toHexString(d.meshTransaction?.transaction?.id?.id), {
        sender: sender,
        receiver: receiver,
        amount: amount,
      });
      discordChannel.send(
        `🌳 \`0x${sender}\` **sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!** ❤️ \nIf you also want to plant a tree send 1000 SMH to **0x${toHexString(
          pk.slice(12)
        )}** 💸`
      );
      console.log(
        `0x${sender} sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!`
      );
    } else console.log("nothing new");
  });
};

const toHexString = (bytes: Uint8Array | Buffer | any): string =>
  bytes instanceof Buffer
    ? bytes.toString("hex")
    : bytes.reduce(
        (str: string, byte: number) => str + byte.toString(16).padStart(2, "0"),
        ""
      );

const sleep = (ms: number | undefined) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

main();
