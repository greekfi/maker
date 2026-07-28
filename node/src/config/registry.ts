// Static list of option tokens with their prices
export interface OptionWithPrice {
  address: string;
  type: "CALL" | "PUT";
  strike: number;  // Strike price in USD
  expiration: number;  // Unix timestamp
  bidPrice: string;  // Price we pay (when user sells to us) - computed dynamically
  askPrice: string;  // Price we charge (when user buys from us) - computed dynamically
  decimals: number;  // Option token decimals (fetched from contract)
  quoteDecimals: number;  // Quote token (USDC) decimals
}

// All option token addresses
export const OPTION_ADDRESSES: string[] = [
  "0xdfbc5312889c0cb485c2354302ad04720b5b2d56",
  "0x5d191ff8c608702afcc18e57e37d5115b8396770",
  "0x6dbe5afa569c235210dee0fd86d56c6895611901",
  "0x93a8f0e3b2103f2deea8ecefd86701b41b7810ea",
  "0xea0295ada7809765a386c6ec97d5ade7bb4999a8",
  "0xe32d43a933ed31965bacdc7ba447175f299c7629",
  "0x4651612edfbf8e2c714c548e3f1baab29237250f",
  "0x21893402f39ed825777cd90dc69e1eaa592e08d2",
  "0x941234b7705a0f1d3c192e7c28e50135b7e35da5",
  "0xf1ac5401a7e3bfa43bb7c7fd35d2e5c5b2ef26e3",
  "0x027ba6ef9915d7c30661fc1b0c884bbfbf4f94c8",
  "0x9fcfe70ef948b624b56ff0258a7983a6bd32dee4",
  "0x19ddd419ca8247fe7562692b8ac9e39858c8fcb7",
  "0x4930ff225799ee51238b3df04f3514087bc0da02",
  "0xe930c5ed82b52b2e726a512254e07b4683d6acd5",
  "0xab04bdab9b5dc0ad04d4809d500c19c822272b84",
  "0xdae5ec90449c913540bc3b9ed01c4934f749ce2a",
  "0xd6eca8f0bb5ca0aff56cb972d34bacf589eec834",
  "0x038a3e63121c71fea3655ecefe8be9d054fd9d5e",
  "0x369a058b4a7343ce67bebe2bfeb5eab61fa50de8",
  "0x94e804718b4b010b4b61f3aca126d8d59740468e",
  "0x12736710e5fb0367239caf88cdadf8026221b959",
  "0x79dc0fcde2446e9f1163fd5aedd9dd34fb4e7868",
  "0xe65f48d43e3ddd43d3e3cbd59af9ca2bacbb84e1",
  "0xbd1d0290e91e9a48a4c51c9f2b55a45eed0b0645",
  "0x8b2e67d17ce9aec4d51bb690c632dcbf4de6c68a",
  "0xe691aa135ad76bd1c2a91a89e3f893f0abfe7a2d",
  "0xca1685e45198c37ea5b29579320daf34d528ebbe",
  "0x70c50dd39b524a4163804cdd4cf0fed85bfce907",
  "0x90b1916f693727129cbeed3c511c5fb3359d8614",
  "0x8ac789e162b76d8024a59becfcc729df6b9322eb",
  "0x14ac1795916b1242ddb8bd9b09859f7b4af678b4",
  "0x3884d3795027b05bef2c10023cdd12708dc9c229",
  "0x6ff8aed4f0d88bf3ac968e02c0a2041c6652b9bb",
  "0x83fa75ad7093b8c8e77c7a03d4593941792b0b4b",
  "0xa127f6d2233dae96066ee8ecc8a09b0a2c782fdf",
  "0xf9d884401e9785ccdfde17067f60f4c91fa75322",
  "0xb9d2a9c29bc2259a1dab70a8d56a3053b95a4904",
  "0xaf8e4d94c731060dc3250e04df76e19e441d60a7",
  "0xafef03aabc2727226a5c78f8ef34078f857c5ec0",
  "0xe29426dfdac10a010a644814444a8f0f739a526e",
  "0x16df5093a1393336c2ef81a48ae37c76bb69ce37",
  "0x9e52fbd6d11580d7c6bd62c30a31826b5f608c3f",
  "0xada77b932375a2db6e084dbeedecd6008fc11b01",
  "0x193ecaa15995b926e7436e52d6f55a536678bab6",
  "0x65377f1f4f067a468d9a99cfe5a2d2078097fb8e",
  "0x4e6975ac3deee071e326d3562492e274ca83a34f",
  "0x3213d3a004a7721b694266a93c8033f461139099",
  "0xb0a4dcbd0dab210d61852e758020c45f50b1e13d",
  "0x2b7e70bc81566b23f9ab5d7fb85eb723ea793ad6",
  "0x8eeb4c3365e400042bf583b7f19d478435e60069",
  "0xdffd4f0747e4cc055973e07ccf34610ee9f507a5",
  "0x2b04ea84691e95f851b48ece9ba8998ceed26d86",
  "0xd127fbe6415e406a14ebb2a2ed431d5eacc8ba2f",
  "0xc856bb71216556460cb60c47e85718ac0db52b5c",
  "0x47a79d2395af93d4f0b43167b0e22e2afadc3f73",
  "0xa6afe1fe782c56091756ce286fc3668a5f5abc84",
  "0xa1cb11b8eca1ce978a8f4e68ed205e1179cc0606",
  "0xa59fee2e6e08bbc8c88ce993947b025c76c62322",
  "0xf050ee063d37bdedfdb836ac0b35ccd2950fd811",
  "0x1284055731c6c4e1c9938247bef2eeb0e2243b03",
  "0x477606ad8267023d82dcca388250399e0e11f5b2",
  "0xab68add4fb153b34efe05c589d20acdde746a1d7",
  "0x1905da3b0f717b3a707893eb9d31638ac63c806b",
  "0xed4d155d5279de57f4ef8af7ed3252b3a4332e0c",
  "0xe9027da3be2eed6f01ac455e4292be8be14f8d0a",
  "0x0e89952c517d9b50785104e1ea6f41e8c6edf3bb",
  "0xbf36c3eb0c61335da40dcac552ef812d7bed837a",
  "0x32493abed345930ad3dd412f37053173526fb6a2",
  "0xe6c977b11190ee879afcc2cbf06ff90f99cb99bf",
  "0x7113e90b610b627b5610fa51298b3c6a71710052",
  "0x5e10c6a0fd003c56cfb5ed06728a10673c872df8",
  "0xf9e9d60e0c21241bd92a2ea337ba52b0253b6e15",
  "0x6084c0d53038e82ac6fcb356712c5404aefdfeb6",
  "0xa960e2e51c9ea5ef14947d453434c1f0af69b428",
  "0x2258c065e90dcdbae6788809bc7ddc8ef9e5de30",
  "0x71e206538669aaaee34470b396fe4a8aed0ed827",
  "0xe30b2768af74d5c40e650a76a6699bb05285761f",
  "0x535a7d3fa2e6ba047328de6bfbfa9994fba5fbb8",
  "0xa9c139e75650e352b15d7bdf1ff8e844ff5c0694",
  "0xb4e12a5e63ed2e2102dea83a362255f4541797c4",
  "0x72698ab70ea63490dccf2a1af64a3431440de3a9",
  "0xd3a6147dcad93a59863d5e0f5c68a731d263e62c",
  "0x0be39cd534317a80846b9170a5ae3c032be1e3af",
  "0xdcea8bc8d1b962eaeac194d8ea7d349b10b52f7c",
  "0xb2b59430d11ab6d7b9001c50c2eb4e9bb3625db0",
  "0xa3bbe582c23b9f33a00ddbf80f4fcae34a79d822",
  "0xa4bfbd6ee1531392bad9b75ab8911010c9cc7483",
  "0x55f14b4ddd6463cf1b616ccc4e032b4f4cee590c",
  "0x8f6f2c1957826ad1d84f5f677e06fde90f70422c",
  "0xc1afbb0c0d099f670b966dbc411bd154f76874a3",
  "0x75d84b19bdafd15d7a6eb8621094b6b1ec3e9b46",
  "0xa91c51b760ef567aacbf62c68a2abd7f516302bd",
  "0xb2f1bb3945274946ffd2c6ea0f582b74bec5f92a",
  "0xf1e57e10416de5a88ef8f9c5ca3c2afdb324aef9",
  "0xae36b9c6a5f79ccf37a9cf5f524f01ee4e84a1ab",
  "0x3c2a3212fe0c0d5dddc1d874eb944c30153e0a20",
  "0xdca3bba9cce395bb451ba82929aec71eb3959ec8",
  "0xee56d9576d50a3699975d105b006c201ba4a84cd",
  "0xbc90a94f0526691f9ff7168843245b3f9f2a0858",
  "0x34a9fcd095413fd0fe8b36b4432fc40d5b6cc7a4",
  "0x1ca50f98db734f4f1dd26bb462aa33612409f2d7",
  "0x91fd0c60459e263d1faccbe0019106a795f3ffa5",
  "0xb4ebe97353643d6be366edccd289bfe4adf78eae",
  "0x38880b43b387cb509ba892423b0862ebd793d38c",
  "0x9917bd40881c658743f2434302260b6e81781553",
  "0xede9e917280e5bcf5270d9ae85578dd7b10aee05",
  "0x50a3f505a206e90db7734aee351d308b294385b6",
  "0xe106ed8acf41c8007fe86633a642c25e3789d058",
  "0x5f469afbd1d8ea4a989dc4e25a941d7a92867c91",
];

// Default expiration: 30 days from now
const DEFAULT_EXPIRATION = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

// Generate OPTIONS_LIST from addresses with default values
// Strike alternates between common ETH option strikes
const STRIKES = [2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400];

export const OPTIONS_LIST: OptionWithPrice[] = OPTION_ADDRESSES.map((address, i) => ({
  address,
  type: (i % 2 === 0 ? "CALL" : "PUT") as "CALL" | "PUT",
  strike: STRIKES[i % STRIKES.length],
  expiration: DEFAULT_EXPIRATION + (Math.floor(i / 16) * 7 * 24 * 60 * 60), // Stagger expirations by week
  bidPrice: "0", // Will be computed by Black-Scholes
  askPrice: "0", // Will be computed by Black-Scholes
  decimals: 6,
  quoteDecimals: 6,
}));

// Create a map for quick lookup
export const OPTIONS_MAP = new Map(
  OPTIONS_LIST.map(opt => [opt.address.toLowerCase(), opt])
);

export function getOption(address: string): OptionWithPrice | undefined {
  return OPTIONS_MAP.get(address.toLowerCase());
}

export function isOptionToken(address: string): boolean {
  return OPTIONS_MAP.has(address.toLowerCase());
}
